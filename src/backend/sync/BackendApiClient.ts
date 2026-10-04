import {
    ACCOUNT_LIST_ENDPOINTS, AUTH_ENDPOINTS, DEVICE_ENDPOINTS, DEVICE_NAME_HEADER, INSTALLATION_ID_HEADER,
    SYNC_ENDPOINTS, USER_ENDPOINTS,
    buildApiUrl
} from "./SyncConfiguration";
import { installationIdentity } from "./InstallationIdentity";
import {
    AccountEnvironmentDto, AccountProfileDto, DeviceInventoryDto, PlanLimitsDto, SyncPushRequest,
    SyncPushResult, SyncSnapshot
} from "./SyncContracts";
import { SessionRepository, sessionRepository, SyncSession, TokenPairDto } from "./SessionRepository";
import { Logger } from "../../utils/logger";
import { withExclusiveLock } from "../../utils/exclusiveLock";
import { resolveDeviceName } from "./DeviceName";
import { t } from "../../i18n/i18n";
import { isLimitName, LIMIT_KEYS, LimitRefusal } from "../entity/PlanLimits";
import { planLimits$ } from "../repository/PremiumStanding";

export type { PlanLimitsDto } from "./SyncContracts";

/** Held by whichever page is trading the refresh token, so that no two pages spend it at once. */
const TOKEN_REFRESH_LOCK = "tabilinks-token-refresh";

/**
 *  The answers to a refresh that mean the session is really over.
 *
 *  401 is the backend refusing the token - unknown, spent, expired, or its account gone - and
 *  400 or 403 are refusals no repetition will change. Anything else is the server, not the
 *  token: a 502 or 503 from the ingress while a new version rolls out, a 500, a 429. Ending the
 *  session on those signed everybody out whose access token happened to expire during a deploy.
 */
const SESSION_ENDING_REFRESH_STATUSES: ReadonlySet<number> = new Set([400, 401, 403]);

/** HTTP methods the backend accepts. */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 *  Outcome of a call to the backend.
 *
 *  "offline" and "rejected" are deliberately two different things and neither is an
 *  exception: a queued change may be retried after an offline result, while a rejected one
 *  will be rejected again no matter how often it is repeated. Later increments (the change
 *  queue, the merge) depend on being able to tell them apart, and a thrown error cannot
 *  carry that distinction without every caller re-deriving it.
 */
export type ApiResult<PAYLOAD> =
    | { outcome: "success"; data: PAYLOAD }
    | { outcome: "rejected"; status: number; message: string; limitRefusal?: LimitRefusal }
    | { outcome: "offline"; message: string };

/** The code the backend's error body carries when a push would break a fair use limit. */
export const FAIR_USE_LIMIT_REACHED = "FAIR_USE_LIMIT_REACHED";

/**
 *  The code the backend's error body carries when a free account would go past a free plan
 *  limit: a push adding a third workspace or a second profile, or a sign-in that would be the
 *  sixth synchronised installation.
 */
export const FREE_PLAN_LIMIT_REACHED = "FREE_PLAN_LIMIT_REACHED";

/**
 *  The signed-in account, as the backend's UserDto returns it.
 *  Only the fields this extension reads are mirrored.
 */
export interface MyAccountDto {
    id: string;

    /**
     *  Whether the account is premium right now. Judged by the server from the account's
     *  entitlement when it answers - a cancelled subscription stays premium until what was paid
     *  for runs out - and never derived here.
     */
    premium: boolean;
}

/**
 *  One row of the account's device list, as the backend's UserDeviceDto returns it.
 *  Only the fields this extension reads are mirrored.
 */
export interface UserDeviceDto {
    id: string;
    deviceName: string;
    browserName: string;
    lastUsedAt: string;

    /** Whether that device still holds a usable session. A clash only matters when it does. */
    signedIn: boolean;
}

/**
 *  The three things this client has to say for itself, worded for the user.
 *
 *  Functions rather than constants, and that is not a style: a constant is evaluated when this
 *  module is imported, which happens before the page has read which language it is drawn in.
 *  It would freeze all three to whatever the fallback is, on every device, for ever.
 */

/** Shown when the backend could not be reached at all. */
const offlineMessage = (): string => t("errors.offline");

/** Shown when an authenticated call is attempted while signed out. */
const notSignedInMessage = (): string => t("errors.notSignedIn");

/** Used when a failure response carries no readable explanation. */
const unexplainedFailureMessage = (): string => t("errors.requestRefused");

/**
 *  Uniform error body the backend returns from every failing endpoint.
 *  Only the fields actually read here are mirrored.
 */
interface ApiErrorResponseDto {
    status?: number;
    error?: string;
    message?: string;
    validationErrors?: string[];
    /** Machine-readable reason; `FAIR_USE_LIMIT_REACHED` and `FREE_PLAN_LIMIT_REACHED` are read here. */
    code?: string;
    /** With either code: which limit, as `LimitName` names it. */
    limit?: string;
    /** With that code: the limit's number, as the server holds it. */
    maximum?: number;
    /** With that code: the website's devices page, absolute, where the user audits and frees room. */
    manageUrl?: string;
}

/**
 *  Reads a limit's refusal - fair use or the free plan's - out of an error body, or nothing.
 *
 *  The body's own `maximum` wins over this extension's number: the server is what refused,
 *  and a limit raised there before an extension update is the one the user should be told.
 *  A limit name this build does not know is not a refusal it can describe, so it falls back
 *  to the ordinary rejection rather than inventing a sentence.
 */
function limitRefusalIn(status: number, errorBody: ApiErrorResponseDto): LimitRefusal | undefined {
    if (status !== 409 || !isLimitName(errorBody.limit)) {
        return undefined;
    }
    let kind: LimitRefusal["kind"];
    if (errorBody.code === FAIR_USE_LIMIT_REACHED) {
        kind = "FAIR_USE";
    } else if (errorBody.code === FREE_PLAN_LIMIT_REACHED) {
        kind = "FREE_PLAN";
    } else {
        return undefined;
    }
    const refusal: LimitRefusal = {
        kind,
        limit: errorBody.limit,
        // The server's number wins: it is what refused. Without one, the limit in force here.
        maximum: typeof errorBody.maximum === "number" && errorBody.maximum >= 0
            ? errorBody.maximum
            : planLimits$.get()[LIMIT_KEYS[errorBody.limit]]
    };
    if (typeof errorBody.manageUrl === "string" && /^https?:\/\//.test(errorBody.manageUrl)) {
        refusal.manageUrl = errorBody.manageUrl;
    }
    return refusal;
}

/**
 *  Names this installation for the user's device list.
 *
 *  The rule itself lives in `DeviceName.ts`, because the service worker stamps the same label
 *  on a closed tab and the panel compares against it - and a row stamped with one label and
 *  compared against another is a row that claims to have happened somewhere else.
 */
function deviceNameHeaderValue(): string {
    return resolveDeviceName(installationIdentity.getName());
}

/**
 *  This installation's identifier, or nothing when it is not available yet.
 *
 *  It is what the backend keys a device on, so sending it is what stops two browsers on one
 *  machine from being recorded as one device. Missing it is not worth failing a call over: the
 *  backend then falls back to matching on the names, which is what it did before this header
 *  existed. In practice it is always there - main.ts awaits installationIdentity.init() before
 *  anything can reach this client - and the guard is here so that a caller which somehow runs
 *  earlier degrades instead of throwing.
 */
function resolveInstallationId(): string | null {
    try {
        return installationIdentity.getInstallationId();
    } catch (notInitialisedYet) {
        return null;
    }
}

/**
 *  Everything this extension sends to the backend goes through here.
 *
 *  Two things it takes care of on every call: the bearer token, and the fact that access
 *  tokens are short lived. A 401 on an authenticated call is answered by trading the
 *  refresh token for a new pair and repeating the original request exactly once — never
 *  more, so that a genuinely dead session cannot turn into a refresh loop.
 */
export class BackendApiClient {

    private LOG: Logger = new Logger("BackendApiClient");
    private sessions: SessionRepository;

    /**
     *  @param sessions  where tokens are read from and written back to; the singleton in
     *                   normal use, injectable so the client stays testable.
     */
    constructor(sessions: SessionRepository = sessionRepository) {
        this.sessions = sessions;
    }

    /**
     *  Signs in with a username or email address and a password.
     *  The caller stores the returned pair; this method deliberately does not, so that
     *  sign-in and session handling stay separable.
     */
    public async logInWithPassword(
        usernameOrEmail: string,
        password: string
    ): Promise<ApiResult<TokenPairDto>> {
        return this.send<TokenPairDto>(
            AUTH_ENDPOINTS.login,
            this.buildRequest("POST", { usernameOrEmail, password }));
    }

    /**
     *  Exchanges the connect code the website minted for a signed-in user for tokens.
     *  Punctuation and letter case are ignored by the backend, so the typed code is sent
     *  as the user wrote it.
     */
    public async redeemConnectCode(code: string): Promise<ApiResult<TokenPairDto>> {
        return this.send<TokenPairDto>(
            AUTH_ENDPOINTS.extensionConnect,
            this.buildRequest("POST", { code }));
    }

    /**
     *  Ends the session behind the stored refresh token on the server.
     *  Clearing the local session is the caller's job, and must happen either way.
     */
    public async logOut(): Promise<ApiResult<void>> {
        const session = this.sessions.getSession();
        if (!session) {
            return { outcome: "success", data: undefined as void };
        }
        return this.send<void>(
            AUTH_ENDPOINTS.logout,
            this.buildRequest("POST", { refreshToken: session.refreshToken }));
    }

    /** The signed-in account, which is where whether it is premium is read from. */
    public getMyAccount(): Promise<ApiResult<MyAccountDto>> {
        return this.sendAuthenticated<MyAccountDto>(USER_ENDPOINTS.me, "GET");
    }

    /** The account's standing and the limits in force for it. */
    public getPlanLimits(): Promise<ApiResult<PlanLimitsDto>> {
        return this.sendAuthenticated<PlanLimitsDto>(USER_ENDPOINTS.planLimits, "GET");
    }

    /** The account's profiles, without their content: who holds a slot is read off these. */
    public listAccountProfiles(): Promise<ApiResult<AccountProfileDto[]>> {
        return this.sendAuthenticated<AccountProfileDto[]>(ACCOUNT_LIST_ENDPOINTS.profiles, "GET");
    }

    /** The account's workspaces, without their content. */
    public listAccountEnvironments(): Promise<ApiResult<AccountEnvironmentDto[]>> {
        return this.sendAuthenticated<AccountEnvironmentDto[]>(ACCOUNT_LIST_ENDPOINTS.environments, "GET");
    }

    /** Replaces what the account knows this installation holds; names and counts only. */
    public reportInventory(inventory: DeviceInventoryDto): Promise<ApiResult<void>> {
        return this.sendAuthenticated<void>(DEVICE_ENDPOINTS.currentInventory, "PUT", inventory);
    }

    /** Lists the devices the account has been signed in from. */
    public listDevices(): Promise<ApiResult<UserDeviceDto[]>> {
        return this.sendAuthenticated<UserDeviceDto[]>(DEVICE_ENDPOINTS.list, "GET");
    }

    /** Changes what one device is called; the label only, never what identifies it. */
    public renameDevice(deviceId: string, name: string): Promise<ApiResult<void>> {
        return this.sendAuthenticated<void>(
            DEVICE_ENDPOINTS.rename(deviceId), "PATCH", { name });
    }

    /**
     *  Adopts a device row this installation did not create, signing out whichever installation
     *  held it. For a reinstall: the row the user recognises survives, with its history.
     */
    public takeOverDevice(deviceId: string): Promise<ApiResult<void>> {
        return this.sendAuthenticated<void>(DEVICE_ENDPOINTS.takeOver(deviceId), "POST");
    }

    /** Fetches everything the account holds, as flat collections. */
    public fetchSnapshot(): Promise<ApiResult<SyncSnapshot>> {
        return this.sendAuthenticated<SyncSnapshot>(SYNC_ENDPOINTS.snapshot, "GET");
    }

    /**
     *  Sends a batch of changes and reports what became of them.
     *
     *  The whole batch is applied by the backend in one transaction, so this either lands
     *  entirely or not at all - there is no half-applied state to repair afterwards.
     */
    public pushChanges(request: SyncPushRequest): Promise<ApiResult<SyncPushResult>> {
        return this.sendAuthenticated<SyncPushResult>(SYNC_ENDPOINTS.push, "POST", request);
    }

    /**
     *  Calls an endpoint that requires a signed-in user, refreshing the token pair and
     *  retrying once when the access token turns out to have expired.
     */
    public async sendAuthenticated<PAYLOAD>(
        endpointPath: string,
        method: HttpMethod,
        body?: unknown
    ): Promise<ApiResult<PAYLOAD>> {

        const session = this.sessions.getSession();
        if (!session) {
            return { outcome: "rejected", status: 401, message: notSignedInMessage() };
        }

        const firstAttempt = await this.send<PAYLOAD>(
            endpointPath,
            this.buildRequest(method, body, session.accessToken));

        if (firstAttempt.outcome !== "rejected" || firstAttempt.status !== 401) {
            return firstAttempt;
        }

        const refreshed = await this.refreshTokenPair(session);
        if (refreshed.outcome !== "success") {
            return refreshed;
        }

        return this.send<PAYLOAD>(
            endpointPath,
            this.buildRequest(method, body, refreshed.data.accessToken));
    }

    /**
     *  Trades the refresh token for a fresh pair and stores it.
     *
     *  The backend revokes the presented token in the process, and every open new tab page
     *  holds the same one - so this runs under a lock all pages share, and first looks at what
     *  is stored now. If that is no longer the session whose access token was just refused,
     *  another page has refreshed in the meantime, and its pair is used rather than a second
     *  refresh spending a token that is already spent. Without that, the second page's refresh
     *  was refused and it ended the session for every page.
     *
     *  Only a definitive refusal ends the session (`SESSION_ENDING_REFRESH_STATUSES`). Any
     *  other failure is reported as offline: the token is still good, the server is not, and
     *  the next synchronisation tries again.
     *
     *  @param refusedSession  the session whose access token the backend just refused
     */
    private refreshTokenPair(refusedSession: SyncSession): Promise<ApiResult<SyncSession>> {
        return withExclusiveLock(TOKEN_REFRESH_LOCK, async () => {

            const stored = await this.sessions.reload();
            if (!stored) {
                return { outcome: "rejected", status: 401, message: notSignedInMessage() };
            }
            if (stored.refreshToken !== refusedSession.refreshToken) {
                this.LOG.debug("refreshTokenPair", "Another page already refreshed; using its pair");
                return { outcome: "success", data: stored };
            }

            const result = await this.send<TokenPairDto>(
                AUTH_ENDPOINTS.refresh,
                this.buildRequest("POST", { refreshToken: stored.refreshToken }));

            if (result.outcome === "success") {
                return { outcome: "success", data: await this.sessions.storeTokenPair(result.data) };
            }
            if (result.outcome === "offline") {
                return result;
            }
            if (result.limitRefusal?.limit === "DEVICES") {
                // Premium ended and this installation is beyond the free plan's number of
                // them: the account ends its session at the refresh, saying so with a 409.
                this.LOG.warn("refreshTokenPair", "Session ended over the installations limit");
                await this.sessions.clearRevoked(result.limitRefusal);
                return result;
            }
            if (SESSION_ENDING_REFRESH_STATUSES.has(result.status)) {
                this.LOG.warn("refreshTokenPair", "Refresh token refused, session ended");
                // Not the user's doing: revoked from the website, or - when premium ended - one
                // of the installations past the free plan's limit. Said so (`revoked$`).
                await this.sessions.clearRevoked();
                return result;
            }
            this.LOG.warn("refreshTokenPair",
                `Refresh failed with ${result.status}; keeping the session for the next attempt`);
            return { outcome: "offline", message: offlineMessage() };
        });
    }

    /** Assembles a request, with the bearer token when one was given. */
    private buildRequest(method: HttpMethod, body?: unknown, accessToken?: string): RequestInit {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            [DEVICE_NAME_HEADER]: deviceNameHeaderValue()
        };
        const installationId = resolveInstallationId();
        if (installationId) {
            headers[INSTALLATION_ID_HEADER] = installationId;
        }
        if (accessToken) {
            headers["Authorization"] = `Bearer ${accessToken}`;
        }
        return {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        };
    }

    /**
     *  Performs one HTTP call and turns everything that can happen into an ApiResult.
     *  A failing fetch means unreachable, not refused — that is the whole "offline" case.
     */
    private async send<PAYLOAD>(
        endpointPath: string,
        requestInit: RequestInit
    ): Promise<ApiResult<PAYLOAD>> {

        const url = buildApiUrl(endpointPath);
        let response: Response;

        try {
            response = await fetch(url, requestInit);
        } catch (networkFailure) {
            this.LOG.warn("send", `Unreachable: ${url}`, networkFailure);
            return { outcome: "offline", message: offlineMessage() };
        }

        if (!response.ok) {
            const { message, limitRefusal } = await this.readFailure(response);
            this.LOG.debug("send", `${response.status} from ${url}: ${message}`);
            return limitRefusal
                ? { outcome: "rejected", status: response.status, message, limitRefusal }
                : { outcome: "rejected", status: response.status, message };
        }

        try {
            return { outcome: "success", data: await this.readPayload<PAYLOAD>(response) };
        } catch (unreadableBody) {
            this.LOG.error("send", `Unreadable response body from ${url}`, unreadableBody);
            return { outcome: "rejected", status: response.status, message: unexplainedFailureMessage() };
        }
    }

    /** Parses a successful body, tolerating the empty ones (204 logout, for instance). */
    private async readPayload<PAYLOAD>(response: Response): Promise<PAYLOAD> {
        const rawBody = await response.text();
        if (!rawBody) {
            return undefined as PAYLOAD;
        }
        return JSON.parse(rawBody) as PAYLOAD;
    }

    /**
     *  Pulls a human readable explanation out of the backend's uniform error body, and a
     *  limit's refusal when that is what it is.
     */
    private async readFailure(
        response: Response
    ): Promise<{ message: string; limitRefusal?: LimitRefusal }> {
        try {
            const rawBody = await response.text();
            if (!rawBody) {
                return { message: unexplainedFailureMessage() };
            }
            const errorBody = JSON.parse(rawBody) as ApiErrorResponseDto;
            const limitRefusal = limitRefusalIn(response.status, errorBody);
            if (errorBody.validationErrors && errorBody.validationErrors.length > 0) {
                return { message: errorBody.validationErrors.join("\n"), limitRefusal };
            }
            return {
                message: errorBody.message ?? errorBody.error ?? unexplainedFailureMessage(),
                limitRefusal
            };
        } catch (unreadableBody) {
            return { message: unexplainedFailureMessage() };
        }
    }
}

export const backendApiClient = new BackendApiClient();
