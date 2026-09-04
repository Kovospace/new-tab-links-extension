// data layer
import { ApiResult, backendApiClient, BackendApiClient } from "../backend/sync/BackendApiClient";
import { SessionRepository, sessionRepository, SyncSession, TokenPairDto } from "../backend/sync/SessionRepository";
import { buildWebsiteUrl, WEBSITE_PATHS } from "../backend/sync/SyncConfiguration";
import { SyncActivity, syncCoordinator } from "../backend/sync/SyncCoordinator";

// utils
import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** What the application menu needs to know about the signed-in account. */
export interface AccountDTO {
    signedIn: boolean;
    username: string | null;

    /** What to tell the user about synchronisation right now. */
    syncStatus: string | null;
}

/**
 *  View model behind the account section of the application menu.
 *
 *  It does not extend AbstractViewModel on purpose: that base class exists to map AppState
 *  onto a component's DTO, and the account has nothing to do with AppState — a user's links
 *  are the same whether they are signed in or not. What it does share is the shape the rest
 *  of the view models have, an "observables" bag plus an initialize(), so that a component
 *  binds to it exactly the way it binds to any other.
 */
export class SyncAccountViewModel {

    private LOG: Logger = new Logger("SyncAccountViewModel");

    private apiClient: BackendApiClient;
    private sessions: SessionRepository;

    public readonly observables = {
        account: new ObservableValue<AccountDTO>(
            { signedIn: false, username: null, syncStatus: null })
    };

    /** Last known session and synchronisation state, combined into the DTO on any change. */
    private session: SyncSession | null = null;
    private activity: SyncActivity = "idle";

    /**
     *  @param apiClient  talks to the backend; the singleton in normal use.
     *  @param sessions   holds the tokens; the singleton in normal use.
     */
    constructor(
        apiClient: BackendApiClient = backendApiClient,
        sessions: SessionRepository = sessionRepository
    ) {
        this.apiClient = apiClient;
        this.sessions = sessions;
    }

    /** Starts publishing the account state; fires immediately with the current session. */
    public initialize(): void {
        this.sessions.session$.subscribe((session: SyncSession | null) => {
            this.session = session;
            this.publishAccount();
        });
        syncCoordinator.activity$.subscribe((activity: SyncActivity) => {
            this.activity = activity;
            this.publishAccount();
        });
    }

    /** Combines who is signed in with how synchronisation is faring. */
    private publishAccount(): void {
        this.observables.account.set({
            signedIn: this.session !== null,
            username: this.session?.username ?? null,
            syncStatus: this.session === null ? null : this.describeActivity()
        });
    }

    /**
     *  Wording for the synchronisation state.
     *
     *  Being offline is stated plainly and without alarm: it is an ordinary condition for a
     *  browser extension, nothing the user has to act on, and the changes they make meanwhile
     *  are sent as soon as the connection returns.
     */
    private describeActivity(): string {
        switch (this.activity) {
            case "working":
                return "Synchronising...";
            case "offline":
                return "Offline - changes will be sent later";
            default:
                return "Synchronised";
        }
    }

    /** Opens the website's registration page in a new tab; the extension hosts no such form. */
    public openRegistrationPage(): void {
        const url = buildWebsiteUrl(WEBSITE_PATHS.register);
        this.LOG.debug("openRegistrationPage", url);
        chrome.tabs.create({ url });
    }

    /** Signs in with a username or email address and a password. */
    public async logIn(usernameOrEmail: string | null, password: string | null): Promise<void> {
        if (!usernameOrEmail || !usernameOrEmail.trim() || !password) {
            this.report("Both the username or email address and the password are required.");
            return;
        }
        this.LOG.debug("logIn", `as ${usernameOrEmail}`);
        const result = await this.apiClient.logInWithPassword(usernameOrEmail.trim(), password);
        await this.storeIssuedTokens(result, "Signing in failed.");
    }

    /** Signs in with the connect code the website shows to a signed-in user. */
    public async connectWithCode(code: string | null): Promise<void> {
        if (!code || !code.trim()) {
            this.report("Enter the code shown on the website's devices page.");
            return;
        }
        this.LOG.debug("connectWithCode", "redeeming connect code");
        const result = await this.apiClient.redeemConnectCode(code.trim());
        await this.storeIssuedTokens(result, "That code was not accepted.");
    }

    /**
     *  Signs out: revokes the session on the server and forgets the tokens here.
     *
     *  Local data is never touched — the user keeps every workspace, group and link they
     *  have, they simply stop being synchronised. The local session is cleared even when
     *  the server cannot be reached, because the user asked to be signed out.
     */
    public async logOut(): Promise<void> {
        this.LOG.debug("logOut", "signing out");
        const result = await this.apiClient.logOut();
        await this.sessions.clear();
        if (result.outcome === "offline") {
            this.report(
                "Signed out on this device, but the server could not be reached, "
                + "so this device may still be listed on your account.");
        }
    }

    /** Stores a freshly issued token pair, or tells the user why there is none. */
    private async storeIssuedTokens(
        result: ApiResult<TokenPairDto>,
        failureHeadline: string
    ): Promise<void> {
        if (result.outcome === "success") {
            const session = await this.sessions.storeTokenPair(result.data);
            this.LOG.log("storeIssuedTokens", `Signed in as ${session.username}`);
            return;
        }
        this.LOG.warn("storeIssuedTokens", `${failureHeadline} ${result.message}`);
        this.report(`${failureHeadline}\n\n${result.message}`);
    }

    /**
     *  Tells the user something went wrong. Deliberately the same blocking alert the rest of
     *  this codebase uses (firstRunViewModel, the menu's danger confirmation) — there is no
     *  notification component yet, and inventing one is not part of this work.
     */
    private report(message: string): void {
        alert(message);
    }
}
