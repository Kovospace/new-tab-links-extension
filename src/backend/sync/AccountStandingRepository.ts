import { ApiResult, backendApiClient, MyAccountDto, PlanLimitsDto } from "./BackendApiClient";
import { SessionRepository, sessionRepository, SyncSession } from "./SessionRepository";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ACCOUNT_STANDING_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";
import { planLimits$, premiumStanding$ } from "../repository/PremiumStanding";
import { defaultPlanLimits, PlanLimits, planLimitsFrom } from "../entity/PlanLimits";

/**
 *  Whether the signed-in account is premium - which is what decides whether the new tab page
 *  shows an advertisement, whether the menu offers an upgrade, and whether the free plan's
 *  limits on workspaces and profiles apply - and, beside it, the limits the account says are in
 *  force (`PlanLimits.ts`), so that a limit changed on the server needs no extension release.
 *
 *  **The server decides, this only remembers.** `/api/v1/users/me/plan-limits` judges it from
 *  the account's entitlement at the moment it answers, and names the limits that go with it;
 *  nothing here works either out from dates or prices. A backend without that endpoint is
 *  asked `/api/v1/users/me` for the standing alone, and the compiled limits stand in. A sync
 *  snapshot carries the same object (`planLimits`), which `adopt()` takes.
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
    /** The limits the account named; absent from an answer that did not name them. */
    limits?: PlanLimits;
    /** When the server said so, epoch milliseconds; 0 means "ask again at the next chance". */
    checkedAt: number;
}

/** Where the answer comes from; the real client in normal use. */
export interface AccountSource {
    getMyAccount(): Promise<ApiResult<MyAccountDto>>;
    getPlanLimits?(): Promise<ApiResult<PlanLimitsDto>>;
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

    /**
     *  The limits in force: the account's, or the free plan's while nobody is signed in. The
     *  singleton's is `planLimits$`.
     */
    public readonly limits$: ObservableValue<PlanLimits>;

    private stored: AccountStanding | null = null;
    private inFlight: Promise<void> | null = null;

    /**
     *  @param account  where the account is read from; the API client in normal use
     *  @param sessions who is signed in; the singleton in normal use
     *  @param now      the clock, so a test can move it
     *  @param premium$ where the standing is published; a fresh value unless given one
     *  @param limits$  where the limits are published; a fresh value unless given one
     */
    constructor(
        private readonly account: AccountSource = backendApiClient,
        private readonly sessions: Pick<SessionRepository, "session$" | "getSession">
            = sessionRepository,
        private readonly now: () => number = () => Date.now(),
        premium$: ObservableValue<boolean> = new ObservableValue<boolean>(false),
        limits$: ObservableValue<PlanLimits> = new ObservableValue<PlanLimits>(defaultPlanLimits(false))
    ) {
        this.premium$ = premium$;
        this.limits$ = limits$;
    }

    /**
     *  Takes the standing and limits a sync snapshot carried, as fresh as an answer asked for.
     *
     *  @param userId   whose snapshot it was
     *  @param premium  the standing it named
     *  @param received the `planLimits` object, of unknown shape
     */
    public async adopt(userId: string, premium: boolean, received: unknown): Promise<void> {
        if (this.sessions.getSession()?.userId !== userId) {
            return;
        }
        await this.keep({ userId, premium, limits: planLimitsFrom(received, premium), checkedAt: this.now() });
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

    /**
     *  Asks the account again now, whatever the age of the last answer: a push it refused over
     *  a limit may mean the standing has changed (premium ended, or was bought elsewhere).
     */
    public async recheck(): Promise<void> {
        if (this.sessions.getSession()) {
            await this.refresh();
        }
    }

    /** Reacts to signing in, signing out, a different account, or just fresh tokens. */
    private async follow(session: SyncSession | null): Promise<void> {
        if (!session) {
            this.premium$.set(false);
            this.limits$.set(defaultPlanLimits(false));
            if (this.stored) {
                this.stored = null;
                await this.datasource.save(ACCOUNT_STANDING_KEY, null);
            }
            return;
        }

        if (this.stored?.userId !== session.userId) {
            // Somebody else's answer, or none: not premium until this account has been asked.
            this.premium$.set(false);
            this.limits$.set(defaultPlanLimits(false));
            await this.refresh();
            return;
        }

        this.premium$.set(this.stored.premium);
        this.limits$.set(this.stored.limits ?? defaultPlanLimits(this.stored.premium));
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

        const answer = await this.askForStanding();
        if (!answer) {
            return;
        }
        // Signed out, or switched accounts, while the request was out: the answer is stale.
        if (this.sessions.getSession()?.userId !== session.userId) {
            return;
        }
        await this.keep({ userId: session.userId, ...answer, checkedAt: this.now() });
    }

    /**
     *  The standing and limits, from the endpoint that names both, or the standing alone from
     *  a backend that predates it. Null when neither answered.
     */
    private async askForStanding(): Promise<{ premium: boolean; limits?: PlanLimits } | null> {
        const withLimits = this.account.getPlanLimits ? await this.account.getPlanLimits() : null;
        if (withLimits?.outcome === "success") {
            const premium = withLimits.data.premium === true;
            return { premium, limits: planLimitsFrom(withLimits.data.limits, premium) };
        }
        if (withLimits && withLimits.outcome === "offline") {
            this.LOG.debug("ask", "standing unchanged: offline");
            return null;
        }
        const result = await this.account.getMyAccount();
        if (result.outcome !== "success") {
            this.LOG.debug("ask", `standing unchanged: ${result.outcome}`);
            return null;
        }
        return { premium: result.data.premium === true };
    }

    /** Stores an answer and publishes it. */
    private async keep(standing: AccountStanding): Promise<void> {
        this.stored = standing;
        await this.datasource.save(ACCOUNT_STANDING_KEY, this.stored);
        this.premium$.set(standing.premium);
        this.limits$.set(standing.limits ?? defaultPlanLimits(standing.premium));
    }
}

export const accountStandingRepository = new AccountStandingRepository(
    backendApiClient, sessionRepository, () => Date.now(), premiumStanding$, planLimits$);
