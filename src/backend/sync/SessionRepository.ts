import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ObservableValue } from "../../utils/observableValue";
import { Logger } from "../../utils/logger";

const SESSION_KEY = "sync_session";

/**
 *  Token pair as the backend returns it from every endpoint that signs a client in
 *  (login, extension-connect, refresh). Mirrors its TokenPairDto.
 */
export interface TokenPairDto {
    accessToken: string;
    accessTokenExpiresInSeconds: number;
    refreshToken: string;
    userId: string;
    username: string;
}

/**
 *  What this installation keeps about the signed-in account.
 *
 *  The refresh token is single use on the backend: every refresh revokes the presented
 *  token and issues a new pair, so the stored pair must always be replaced, never merged.
 */
export interface SyncSession {
    accessToken: string;
    refreshToken: string;
    userId: string;
    username: string;
    /** Epoch milliseconds at which the access token stops being accepted. */
    accessTokenExpiresAt: number;
}

/**
 *  Holds the signed-in session in chrome.storage.local and publishes it, so that the UI
 *  redraws itself on sign-in and sign-out without polling.
 *
 *  It owns tokens only. Signing out clears this repository and nothing else — the user's
 *  links, groups and profiles are untouched by anything in here.
 */
export class SessionRepository {

    private LOG!: Logger;
    private datasource = new ChromeStorageWrapper();
    private session: SyncSession | null = null;

    readonly session$ = new ObservableValue<SyncSession | null>(null);

    /** Loads the persisted session, if there is one. Awaited during application startup. */
    public async init(): Promise<void> {
        this.LOG = new Logger("SessionRepository");
        this.session = await this.datasource.get<SyncSession>(SESSION_KEY);
        this.LOG.debug("init", this.session
            ? `Signed in as ${this.session.username}`
            : "No stored session");
        this.session$.set(this.session);
    }

    public getSession(): SyncSession | null {
        return this.session;
    }

    public isSignedIn(): boolean {
        return this.session !== null;
    }

    /**
     *  Replaces the stored session with a freshly issued token pair.
     *  Used by sign-in, by connect-code redemption and after every token refresh.
     */
    public async storeTokenPair(tokenPair: TokenPairDto): Promise<SyncSession> {
        const session: SyncSession = {
            accessToken: tokenPair.accessToken,
            refreshToken: tokenPair.refreshToken,
            userId: tokenPair.userId,
            username: tokenPair.username,
            accessTokenExpiresAt: Date.now() + (tokenPair.accessTokenExpiresInSeconds * 1000)
        };
        this.session = session;
        await this.datasource.save(SESSION_KEY, session);
        this.session$.set(session);
        return session;
    }

    /**
     *  Forgets the tokens. Local data is never part of this — only syncing stops.
     */
    public async clear(): Promise<void> {
        this.session = null;
        await this.datasource.save<SyncSession | null>(SESSION_KEY, null);
        this.session$.set(null);
    }
}

export const sessionRepository = new SessionRepository();
