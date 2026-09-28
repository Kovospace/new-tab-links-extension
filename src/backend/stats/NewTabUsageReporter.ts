import { buildApiUrl, STATS_ENDPOINTS } from "../sync/SyncConfiguration";
import { NEW_TAB_USAGE_KEY } from "../datasource/chromeStorage/storageKeys";
import { Logger } from "../../utils/logger";

/**
 *  Counts new tabs opened and reports them to the backend in daily totals.
 *
 *  **What is sent is a number per day, and nothing else.** No user, no installation id, no
 *  address - not even whether anybody is signed in. It is what an ad network asks when it is
 *  asked to take a placement, and what the admin page draws.
 *
 *  **Stored, not held.** Counts wait in `chrome.storage.local` until they are reported, so a
 *  browser closed before the interval ran out loses nothing: they go out with the first new tab
 *  of the next session, however much later that is. MV3 has no dependable moment at which a
 *  browser is closing, and with the counts stored it does not need one.
 *
 *  **By the day they happened**, not the day they were reported - a Friday evening reported on
 *  Monday morning is Friday's traffic. Days are the browser's local dates.
 *
 *  **The server sets the pace.** Every successful report answers how long to wait before the
 *  next, so the interval can be tuned without a release; the default is only what a device
 *  that has never heard from the server goes by.
 *
 *  Run in the service worker only - see `usageStatsWorker`. Two pages doing this themselves
 *  would each read, add one and write back, and one count would be lost; both could also find
 *  the interval over and send the same counts twice.
 */

/** How long to wait between reports until the server says otherwise: fifteen minutes. */
export const DEFAULT_REPORT_INTERVAL_MS = 15 * 60 * 1000;

/** Bounds on an interval the server asks for, so a bad value neither floods nor silences. */
export const MIN_REPORT_INTERVAL_MS = 60 * 1000;
export const MAX_REPORT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Days older than this are not worth sending: the backend refuses them anyway. */
export const MAX_DAY_AGE = 7;

/** The limits the backend puts on one report to /api/v1/stats/new-tabs. */
export const MAX_COUNT_PER_DAY = 2000;
export const MAX_DAYS_PER_REPORT = 8;

/** What is kept between new tabs. */
export interface NewTabUsage {
    /** Counts not yet reported, by local date (YYYY-MM-DD). */
    pending: Record<string, number>;
    /** When a report was last attempted, successful or not; 0 for never. */
    lastReportAt: number;
    /** How long to wait after a report before the next. */
    intervalMs: number;
}

/** What the reporter needs from the outside world, so a test can be the outside world. */
export interface UsageReporterDependencies {
    load(): Promise<NewTabUsage | null>;
    save(usage: NewTabUsage): Promise<void>;
    post(url: string, body: unknown): Promise<{ ok: boolean; json(): Promise<unknown> }>;
    now(): number;
}

export class NewTabUsageReporter {

    private LOG: Logger = new Logger("NewTabUsageReporter");

    constructor(private readonly dependencies: UsageReporterDependencies) {}

    /**
     *  Counts one new tab, and reports what is pending if the interval has run out.
     *
     *  Never throws: statistics are not worth a broken new tab page.
     */
    public async recordNewTab(): Promise<void> {
        try {
            const now = this.dependencies.now();
            const usage = await this.load(now);

            const today = localDay(now);
            usage.pending[today] = (usage.pending[today] ?? 0) + 1;
            await this.dependencies.save(usage);

            if (now - usage.lastReportAt >= usage.intervalMs) {
                await this.report(usage, now);
            }
        } catch (error) {
            this.LOG.warn("recordNewTab", `not counted: ${String(error)}`);
        }
    }

    /**
     *  Sends what is pending and forgets what was sent.
     *
     *  The attempt is stamped whether or not it succeeds. Otherwise an offline browser, or a
     *  backend that is down, would be asked again on every single new tab; this way a failure
     *  waits out the interval like a success does, and the counts simply stay pending.
     */
    private async report(usage: NewTabUsage, now: number): Promise<void> {

        const sent = entriesToSend(usage.pending);
        usage.lastReportAt = now;
        await this.dependencies.save(usage);

        if (sent.length === 0) {
            return;
        }

        let response;
        try {
            response = await this.dependencies.post(
                buildApiUrl(STATS_ENDPOINTS.newTabs), { days: sent });
        } catch {
            return; // offline - the counts stay pending
        }
        if (!response.ok) {
            return;
        }

        const answered = await response.json().catch(() => null);

        // Re-read rather than reuse: a count recorded while the request was in flight is not
        // one that was sent, and writing back the copy from before it would lose it.
        const latest = await this.load(now);
        for (const { day, count } of sent) {
            const remaining = (latest.pending[day] ?? 0) - count;
            if (remaining > 0) {
                latest.pending[day] = remaining;
            } else {
                delete latest.pending[day];
            }
        }
        latest.lastReportAt = now;
        latest.intervalMs = intervalFrom(answered, latest.intervalMs);
        await this.dependencies.save(latest);
    }

    /** What is stored, with days too old to send dropped; an empty record if nothing is. */
    private async load(now: number): Promise<NewTabUsage> {
        const stored = await this.dependencies.load();
        const oldest = localDay(now - MAX_DAY_AGE * 24 * 60 * 60 * 1000);

        const pending: Record<string, number> = {};
        for (const [day, count] of Object.entries(stored?.pending ?? {})) {
            if (day >= oldest && Number.isFinite(count) && count > 0) {
                pending[day] = Math.floor(count);
            }
        }
        return {
            pending,
            lastReportAt: stored?.lastReportAt ?? 0,
            intervalMs: clampInterval(stored?.intervalMs ?? DEFAULT_REPORT_INTERVAL_MS)
        };
    }
}

/**
 *  The entries one report carries: the most recent days first, within the backend's limits.
 *  A day over the per-entry limit sends the limit and keeps the rest for the next report.
 */
export function entriesToSend(pending: Record<string, number>): { day: string; count: number }[] {
    return Object.keys(pending)
        .sort()
        .reverse()
        .slice(0, MAX_DAYS_PER_REPORT)
        .map(day => ({ day, count: Math.min(pending[day], MAX_COUNT_PER_DAY) }));
}

/** The interval the server asked for, in bounds; the current one when it asked for nothing. */
export function intervalFrom(answered: unknown, current: number): number {
    const seconds = (answered as { nextReportAfterSeconds?: unknown } | null)?.nextReportAfterSeconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
        return current;
    }
    return clampInterval(seconds * 1000);
}

function clampInterval(milliseconds: number): number {
    if (!Number.isFinite(milliseconds)) return DEFAULT_REPORT_INTERVAL_MS;
    return Math.min(MAX_REPORT_INTERVAL_MS, Math.max(MIN_REPORT_INTERVAL_MS, milliseconds));
}

/** The browser's local date as YYYY-MM-DD - sortable as a string, which `load` relies on. */
export function localDay(timestamp: number): string {
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

/** The reporter as the service worker runs it: chrome.storage and the real network. */
export function createNewTabUsageReporter(): NewTabUsageReporter {
    return new NewTabUsageReporter({
        load: async () => {
            const stored = await chrome.storage.local.get(NEW_TAB_USAGE_KEY);
            return (stored[NEW_TAB_USAGE_KEY] as NewTabUsage | undefined) ?? null;
        },
        save: usage => chrome.storage.local.set({ [NEW_TAB_USAGE_KEY]: usage }),
        // No credentials and no Authorization header, deliberately: the count must not be
        // attributable to an account, and the endpoint does not ask for one.
        post: (url, body) => fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "omit"
        }),
        now: () => Date.now()
    });
}
