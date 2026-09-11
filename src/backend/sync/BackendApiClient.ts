import {
    AUTH_ENDPOINTS, DEVICE_ENDPOINTS, DEVICE_NAME_HEADER, INSTALLATION_ID_HEADER, SYNC_ENDPOINTS,
    buildApiUrl
} from "./SyncConfiguration";
import { installationIdentity } from "./InstallationIdentity";
import { SyncPushRequest, SyncPushResult, SyncSnapshot } from "./SyncContracts";
import { SessionRepository, sessionRepository, TokenPairDto } from "./SessionRepository";
import { Logger } from "../../utils/logger";
import { resolveDeviceName } from "./DeviceName";

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
    | { outcome: "rejected"; status: number; message: string }
    | { outcome: "offline"; message: string };

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

/** Shown when the backend could not be reached at all. */
const OFFLINE_MESSAGE = "The synchronisation server could not be reached. Check your connection and try again.";

/** Shown when an authenticated call is attempted while signed out. */
const NOT_SIGNED_IN_MESSAGE = "Not signed in.";

/** Used when a failure response carries no readable explanation. */
const UNEXPLAINED_FAILURE_MESSAGE = "The synchronisation server refused the request.";

/**
 *  Uniform error body the backend returns from every failing endpoint.
 *  Only the fields actually read here are mirrored.
 */
interface ApiErrorResponseDto {
    status?: number;
    error?: string;
    message?: string;
    validationErrors?: string[];
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
            return { outcome: "rejected", status: 401, message: NOT_SIGNED_IN_MESSAGE };
        }

        const firstAttempt = await this.send<PAYLOAD>(
            endpointPath,
            this.buildRequest(method, body, session.accessToken));

        if (firstAttempt.outcome !== "rejected" || firstAttempt.status !== 401) {
            return firstAttempt;
        }

        const refreshed = await this.refreshTokenPair();
        if (refreshed.outcome !== "success") {
            return refreshed;
        }

        return this.send<PAYLOAD>(
            endpointPath,
            this.buildRequest(method, body, refreshed.data.accessToken));
    }

    /**
     *  Trades the stored refresh token for a fresh pair and stores it.
     *
     *  The presented token is revoked by the backend in the process, so the returned pair
     *  has to replace what is stored — and a refusal means the session is genuinely over,
     *  which is why it clears it. An offline result changes nothing: the token is still
     *  valid, the network is not.
     */
    private async refreshTokenPair(): Promise<ApiResult<TokenPairDto>> {

        const session = this.sessions.getSession();
        if (!session) {
            return { outcome: "rejected", status: 401, message: NOT_SIGNED_IN_MESSAGE };
        }

        const result = await this.send<TokenPairDto>(
            AUTH_ENDPOINTS.refresh,
            this.buildRequest("POST", { refreshToken: session.refreshToken }));

        if (result.outcome === "success") {
            await this.sessions.storeTokenPair(result.data);
        } else if (result.outcome === "rejected") {
            this.LOG.warn("refreshTokenPair", "Refresh token refused, session ended");
            await this.sessions.clear();
        }
        return result;
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
            return { outcome: "offline", message: OFFLINE_MESSAGE };
        }

        if (!response.ok) {
            const message = await this.readFailureMessage(response);
            this.LOG.debug("send", `${response.status} from ${url}: ${message}`);
            return { outcome: "rejected", status: response.status, message };
        }

        try {
            return { outcome: "success", data: await this.readPayload<PAYLOAD>(response) };
        } catch (unreadableBody) {
            this.LOG.error("send", `Unreadable response body from ${url}`, unreadableBody);
            return { outcome: "rejected", status: response.status, message: UNEXPLAINED_FAILURE_MESSAGE };
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

    /** Pulls a human readable explanation out of the backend's uniform error body. */
    private async readFailureMessage(response: Response): Promise<string> {
        try {
            const rawBody = await response.text();
            if (!rawBody) {
                return UNEXPLAINED_FAILURE_MESSAGE;
            }
            const errorBody = JSON.parse(rawBody) as ApiErrorResponseDto;
            if (errorBody.validationErrors && errorBody.validationErrors.length > 0) {
                return errorBody.validationErrors.join("\n");
            }
            return errorBody.message ?? errorBody.error ?? UNEXPLAINED_FAILURE_MESSAGE;
        } catch (unreadableBody) {
            return UNEXPLAINED_FAILURE_MESSAGE;
        }
    }
}

export const backendApiClient = new BackendApiClient();
