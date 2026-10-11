import { ApiResult, backendApiClient, MyAccountDto, PlanLimitsDto } from "./BackendApiClient";
import { SessionRepository, sessionRepository, SyncSession } from "./SessionRepository";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ACCOUNT_STANDING_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";
import { planLimits$, premiumStanding$ } from "../repository/PremiumStanding";
import { defaultPlanLimits, PlanLimits, planLimitsFrom } from "../entity/PlanLimits";
import { FetchReachabilityProbe, ReachabilityProbe, Unreachability } from "./ReachabilityProbe";

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
 *
 *  **Asked on a timer, not only when a page opens** (`STANDING_POLL_MS`), and an answer dated
 *  in the future counts as stale. The standing sits in `chrome.storage.local`, where anyone
 *  can write `premium: true` from the console; with synchronisation on a pull put the truth
 *  back, but a browser that does not synchronise has nothing else that asks. A forged answer
 *  now lasts until the next poll.
 *
 *  **Not hearing back is not being told no** - unless the silence looks deliberate. A browser
 *  that is plainly offline keeps premium however long it stays away; it is corrected the
 *  moment it is online and asks. But premium the account has not confirmed for a day, while
 *  the website or the API host itself answers (`ReachabilityProbe`), is the standing endpoint
 *  being blocked, and premium the account has not confirmed for a week while the rest of the
 *  internet answers and nothing of ours does, is the whole domain being blocked - or an outage
 *  long enough that a banner is the least of it. Either is read as not premium, which takes
 *  nothing away but the lifted limits and the missing banner: only growth is ever refused.
 *  The next answer the account gives puts it right.
 */

/** How long an answer is trusted before the account is asked again. */
export const STANDING_MAX_AGE_MS = 30 * 60 * 1000;

/** How often an open page checks whether the answer it holds has grown stale. */
export const STANDING_POLL_MS = 5 * 60 * 1000;

/** Unconfirmed premium, with our own hosts answering, is not trusted after this long. */
export const BLOCKED_GRACE_MS = 24 * 60 * 60 * 1000;

/** Unconfirmed premium, with only the rest of the internet answering, after this long. */
export const UNREACHABLE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** The least time between two diagnoses, so a long outage is not a probe every poll. */
const DIAGNOSIS_INTERVAL_MS = 60 * 60 * 1000;

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
    private lastDiagnosisAt: number = Number.NEGATIVE_INFINITY;

    /**
     *  @param account  where the account is read from; the API client in normal use
     *  @param sessions who is signed in; the singleton in normal use
     *  @param now      the clock, so a test can move it
     *  @param premium$ where the standing is published; a fresh value unless given one
     *  @param limits$  where the limits are published; a fresh value unless given one
     *  @param probe    tells "offline" from "blocked" when the account does not answer
     *  @param pollMs   how often to look for a stale answer; 0, the tests' default, never
     */
    constructor(
        private readonly account: AccountSource = backendApiClient,
        private readonly sessions: Pick<SessionRepository, "session$" | "getSession">
            = sessionRepository,
        private readonly now: () => number = () => Date.now(),
        premium$: ObservableValue<boolean> = new ObservableValue<boolean>(false),
        limits$: ObservableValue<PlanLimits> = new ObservableValue<PlanLimits>(defaultPlanLimits(false)),
        private readonly probe: ReachabilityProbe = new FetchReachabilityProbe(),
        private readonly pollMs: number = 0
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
        if (this.pollMs > 0) {
            setInterval(() => void this.poll(), this.pollMs);
        }
    }

    /**
     *  Asks again when the answer held has grown stale. Re-reads storage first: another open
     *  page may have asked a minute ago, and its answer is as good as this page's own.
     */
    public async poll(): Promise<void> {
        const session = this.sessions.getSession();
        if (!session) {
            return;
        }
        this.stored = await this.datasource.get<AccountStanding>(ACCOUNT_STANDING_KEY);
        if (this.stored?.userId !== session.userId) {
            await this.follow(session);
            return;
        }
        this.publish(this.stored);
        if (this.isStale(this.stored)) {
            await this.refresh();
        }
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

        this.publish(this.stored);
        if (this.isStale(this.stored)) {
            await this.refresh();
        }
    }

    /**
     *  Whether the answer is old enough to ask again - or dated in the future, which no answer
     *  the account gave can be, and which would otherwise never grow old.
     */
    private isStale(standing: AccountStanding): boolean {
        const age = this.now() - standing.checkedAt;
        return age < 0 || age >= STANDING_MAX_AGE_MS;
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
        if (answer === "offline") {
            await this.judgeSilence(session.userId);
            return;
        }
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
    private async askForStanding(): Promise<{ premium: boolean; limits?: PlanLimits } | "offline" | null> {
        const withLimits = this.account.getPlanLimits ? await this.account.getPlanLimits() : null;
        if (withLimits?.outcome === "success") {
            const premium = withLimits.data.premium === true;
            return { premium, limits: planLimitsFrom(withLimits.data.limits, premium) };
        }
        if (withLimits && withLimits.outcome === "offline") {
            this.LOG.debug("ask", "standing unchanged: offline");
            return "offline";
        }
        const result = await this.account.getMyAccount();
        if (result.outcome === "offline") {
            return "offline";
        }
        if (result.outcome !== "success") {
            this.LOG.debug("ask", `standing unchanged: ${result.outcome}`);
            return null;
        }
        return { premium: result.data.premium === true };
    }

    /**
     *  Decides what the account not answering means for premium it has not confirmed lately.
     *
     *  Nothing at all happens to a free account, nor within a day of the last confirmation -
     *  no probe is even sent. Past that, the probe says whether anything of ours answers.
     */
    private async judgeSilence(userId: string): Promise<void> {
        const standing = this.stored;
        if (!standing?.premium || standing.userId !== userId) {
            return;
        }
        // A date in the future is no answer the account gave: as unconfirmed as can be.
        const age = this.now() - standing.checkedAt;
        const unconfirmedFor = age < 0 ? Number.POSITIVE_INFINITY : age;
        if (unconfirmedFor < BLOCKED_GRACE_MS) {
            return;
        }
        if (this.now() - this.lastDiagnosisAt < DIAGNOSIS_INTERVAL_MS) {
            return;
        }
        this.lastDiagnosisAt = this.now();

        const diagnosis = await this.probe.diagnose();
        if (!this.forfeits(diagnosis, unconfirmedFor)) {
            this.LOG.debug("judgeSilence", `premium kept: ${diagnosis}`);
            return;
        }
        this.LOG.warn("judgeSilence",
            `premium unconfirmed for ${Math.round(unconfirmedFor / 3_600_000)} h while ${diagnosis}; reading it as free`);
        // The date of the last real answer stays, so the next chance to ask still asks.
        await this.keep({ userId, premium: false, checkedAt: standing.checkedAt });
    }

    private forfeits(diagnosis: Unreachability, unconfirmedFor: number): boolean {
        switch (diagnosis) {
            case "offline":
                return false;
            case "accountBlocked":
                return unconfirmedFor >= BLOCKED_GRACE_MS;
            case "ourServersUnreachable":
                return unconfirmedFor >= UNREACHABLE_GRACE_MS;
        }
    }

    /** Stores an answer and publishes it. */
    private async keep(standing: AccountStanding): Promise<void> {
        this.stored = standing;
        await this.datasource.save(ACCOUNT_STANDING_KEY, this.stored);
        this.publish(standing);
    }

    private publish(standing: AccountStanding): void {
        this.premium$.set(standing.premium);
        this.limits$.set(standing.limits ?? defaultPlanLimits(standing.premium));
    }
}

export const accountStandingRepository = new AccountStandingRepository(
    backendApiClient, sessionRepository, () => Date.now(), premiumStanding$, planLimits$,
    new FetchReachabilityProbe(), STANDING_POLL_MS);
