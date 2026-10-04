import { ApiResult, backendApiClient, MyAccountDto } from "./BackendApiClient";
import { SessionRepository, sessionRepository, SyncSession } from "./SessionRepository";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ACCOUNT_STANDING_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";
import { premiumStanding$ } from "../repository/PremiumStanding";

/**
 *  Whether the signed-in account is premium - which is what decides whether the new tab page
 *  shows an advertisement, whether the menu offers an upgrade, and whether the free plan's
 *  limits on workspaces and profiles apply (`FreePlanLimits.ts`).
 *
 *  **The server decides, this only remembers.** `/api/v1/users/me` judges it from the account's
 *  entitlement at the moment it answers; nothing here works it out from dates or prices.
 *
 *  **Remembered, so a premium user never sees an ad flash.** The answer is kept with the account
 *  it is about and when it was given, and `init()` publishes it before anything is drawn. The
 *  network is asked afterwards, and only when the answer is older than `STANDING_MAX_AGE_MS` -
 *  every new tab asking would be a request per tab for something that changes a few times in
 *  an account's life.
 *
 *  **Kept as it was when the account cannot be reached.** Offline, a premium user stays premium
 *  and a free one stays free; a refusal does not demote anybody either. Only an answer changes it.
 *
 *  **Signed out is not premium**, and a different account starts from "not premium" until it
 *  has been asked about: one account's purchase is never shown on another's page.
 */

/** How long an answer is trusted before the account is asked again. */
export const STANDING_MAX_AGE_MS = 30 * 60 * 1000;

/** What is kept between pages. */
export interface AccountStanding {
    userId: string;
    premium: boolean;
    /** When the server said so, epoch milliseconds; 0 means "ask again at the next chance". */
    checkedAt: number;
}

/** Where the answer comes from; the real client in normal use. */
export interface AccountSource {
    getMyAccount(): Promise<ApiResult<MyAccountDto>>;
}

export class AccountStandingRepository {

    private LOG: Logger = new Logger("AccountStandingRepository");
    private datasource = new ChromeStorageWrapper();

    /**
     *  Whether the signed-in account is premium; false when nobody is signed in.
     *
     *  The singleton's is `premiumStanding$`, which the repositories read to decide whether
     *  the free plan's limits apply; a test's instance gets one of its own.
     */
    public readonly premium$: ObservableValue<boolean>;

    private stored: AccountStanding | null = null;
    private inFlight: Promise<void> | null = null;

    /**
     *  @param account  where the account is read from; the API client in normal use
     *  @param sessions who is signed in; the singleton in normal use
     *  @param now      the clock, so a test can move it
     *  @param premium$ where the standing is published; a fresh value unless given one
     */
    constructor(
        private readonly account: AccountSource = backendApiClient,
        private readonly sessions: Pick<SessionRepository, "session$" | "getSession">
            = sessionRepository,
        private readonly now: () => number = () => Date.now(),
        premium$: ObservableValue<boolean> = new ObservableValue<boolean>(false)
    ) {
        this.premium$ = premium$;
    }

    /**
     *  Publishes what was last known, then keeps it current with the session.
     *
     *  Awaited before the page draws, and quick to await: it reads storage and nothing else.
     *  Whatever has to be asked over the network is asked in the background.
     */
    public async init(): Promise<void> {
        this.stored = await this.datasource.get<AccountStanding>(ACCOUNT_STANDING_KEY);
        this.sessions.session$.subscribe(session => void this.follow(session));
    }

    /**
     *  Makes the next chance to ask actually ask.
     *
     *  Called when the user goes off to buy premium: they come back to a new tab expecting the
     *  advertisement to be gone, and that tab should not trust half an hour old news.
     */
    public async markStale(): Promise<void> {
        if (!this.stored) return;
        this.stored = { ...this.stored, checkedAt: 0 };
        await this.datasource.save(ACCOUNT_STANDING_KEY, this.stored);
    }

    /** Reacts to signing in, signing out, a different account, or just fresh tokens. */
    private async follow(session: SyncSession | null): Promise<void> {
        if (!session) {
            this.premium$.set(false);
            if (this.stored) {
                this.stored = null;
                await this.datasource.save(ACCOUNT_STANDING_KEY, null);
            }
            return;
        }

        if (this.stored?.userId !== session.userId) {
            // Somebody else's answer, or none: not premium until this account has been asked.
            this.premium$.set(false);
            await this.refresh();
            return;
        }

        this.premium$.set(this.stored.premium);
        if (this.now() - this.stored.checkedAt >= STANDING_MAX_AGE_MS) {
            await this.refresh();
        }
    }

    /** Asks the account, once at a time, and keeps the answer if there is one. */
    private refresh(): Promise<void> {
        if (!this.inFlight) {
            this.inFlight = this.ask().finally(() => { this.inFlight = null; });
        }
        return this.inFlight;
    }

    private async ask(): Promise<void> {
        const session = this.sessions.getSession();
        if (!session) return;

        const result = await this.account.getMyAccount();
        if (result.outcome !== "success") {
            this.LOG.debug("ask", `standing unchanged: ${result.outcome}`);
            return;
        }
        // Signed out, or switched accounts, while the request was out: the answer is stale.
        if (this.sessions.getSession()?.userId !== session.userId) {
            return;
        }

        this.stored = {
            userId: session.userId,
            premium: result.data.premium === true,
            checkedAt: this.now()
        };
        await this.datasource.save(ACCOUNT_STANDING_KEY, this.stored);
        this.premium$.set(this.stored.premium);
    }
}

export const accountStandingRepository = new AccountStandingRepository(
    backendApiClient, sessionRepository, () => Date.now(), premiumStanding$);
