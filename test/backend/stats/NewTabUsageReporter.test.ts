import { beforeEach, describe, expect, it } from "vitest";

import {
    DEFAULT_REPORT_INTERVAL_MS, entriesToSend, intervalFrom, localDay, MAX_COUNT_PER_DAY,
    MAX_DAYS_PER_REPORT, MAX_REPORT_INTERVAL_MS, MIN_REPORT_INTERVAL_MS, NewTabUsage,
    NewTabUsageReporter
} from "../../../src/backend/stats/NewTabUsageReporter";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A fake world: storage in a variable, a clock that moves when told, a server that records. */
let stored: NewTabUsage | null;
let clock: number;
let requests: { url: string; body: { days: { day: string; count: number }[] } }[];
let server: () => Promise<{ ok: boolean; json(): Promise<unknown> }>;

function reporter(): NewTabUsageReporter {
    return new NewTabUsageReporter({
        load: async () => (stored ? JSON.parse(JSON.stringify(stored)) : null),
        save: async usage => { stored = JSON.parse(JSON.stringify(usage)); },
        post: async (url, body) => {
            requests.push({ url, body: body as { days: { day: string; count: number }[] } });
            return server();
        },
        now: () => clock
    });
}

const answering = (seconds?: number) => async () => ({
    ok: true,
    json: async () => (seconds === undefined ? {} : { nextReportAfterSeconds: seconds })
});

beforeEach(() => {
    stored = null;
    clock = new Date(2026, 8, 28, 12, 0).getTime();
    requests = [];
    server = answering(900);
});

describe("NewTabUsageReporter", () => {

    it("reports the first new tab straight away, since nothing was ever reported", async () => {
        await reporter().recordNewTab();

        expect(requests).toHaveLength(1);
        expect(requests[0].url).toMatch(/\/api\/v1\/stats\/new-tabs$/);
        expect(requests[0].body).toEqual({ days: [{ day: "2026-09-28", count: 1 }] });
        expect(stored?.pending).toEqual({});
    });

    it("keeps counting without reporting until the interval is over", async () => {
        await reporter().recordNewTab();
        clock += 5 * MINUTE;
        await reporter().recordNewTab();
        await reporter().recordNewTab();

        expect(requests).toHaveLength(1);
        expect(stored?.pending).toEqual({ "2026-09-28": 2 });

        clock += 10 * MINUTE;
        await reporter().recordNewTab();

        expect(requests).toHaveLength(2);
        expect(requests[1].body.days).toEqual([{ day: "2026-09-28", count: 3 }]);
    });

    /** The point of storing the counts: a short session is reported by the next one. */
    it("sends what a short session left behind with the next session's first tab", async () => {
        await reporter().recordNewTab();          // reported
        clock += 2 * MINUTE;
        await reporter().recordNewTab();          // pending when the browser closes
        clock += 3 * DAY;
        await reporter().recordNewTab();

        expect(requests[1].body.days).toEqual([
            { day: "2026-10-01", count: 1 },
            { day: "2026-09-28", count: 1 }
        ]);
    });

    it("keeps the counts when the report fails, and waits out the interval before trying again", async () => {
        server = async () => { throw new TypeError("Failed to fetch"); };
        await reporter().recordNewTab();
        clock += MINUTE;
        await reporter().recordNewTab();

        expect(requests).toHaveLength(1);
        expect(stored?.pending).toEqual({ "2026-09-28": 2 });

        server = answering(900);
        clock += 15 * MINUTE;
        await reporter().recordNewTab();

        expect(requests[1].body.days).toEqual([{ day: "2026-09-28", count: 3 }]);
        expect(stored?.pending).toEqual({});
    });

    it("keeps the counts on a refusal from the server", async () => {
        server = async () => ({ ok: false, json: async () => ({}) });
        await reporter().recordNewTab();

        expect(stored?.pending).toEqual({ "2026-09-28": 1 });
    });

    it("goes by the interval the server asks for", async () => {
        server = answering(60 * 60);
        await reporter().recordNewTab();
        clock += 30 * MINUTE;
        await reporter().recordNewTab();

        expect(requests).toHaveLength(1);
        expect(stored?.intervalMs).toBe(60 * MINUTE);
    });

    it("drops days too old for the backend to accept", async () => {
        stored = {
            pending: { "2026-09-01": 40, "2026-09-25": 2 },
            lastReportAt: clock - DAY,
            intervalMs: DEFAULT_REPORT_INTERVAL_MS
        };

        await reporter().recordNewTab();

        expect(requests[0].body.days.map(entry => entry.day)).toEqual(["2026-09-28", "2026-09-25"]);
    });

    /**
     *  A count recorded while a report is in flight was not in that report. Writing back the
     *  copy from before the request would lose it.
     */
    it("keeps a count recorded while the report was in flight", async () => {
        server = async () => {
            stored!.pending["2026-09-28"] += 1;
            return { ok: true, json: async () => ({}) };
        };

        await reporter().recordNewTab();

        expect(stored?.pending).toEqual({ "2026-09-28": 1 });
    });
});

describe("entriesToSend", () => {

    it("sends the most recent days within the per-report limit", () => {
        const pending: Record<string, number> = {};
        for (let day = 1; day <= 12; day++) {
            pending[`2026-09-${String(day).padStart(2, "0")}`] = day;
        }

        const sent = entriesToSend(pending);

        expect(sent).toHaveLength(MAX_DAYS_PER_REPORT);
        expect(sent[0].day).toBe("2026-09-12");
    });

    it("sends no more than the per-day limit, leaving the rest for later", () => {
        expect(entriesToSend({ "2026-09-28": MAX_COUNT_PER_DAY + 5 }))
            .toEqual([{ day: "2026-09-28", count: MAX_COUNT_PER_DAY }]);
    });
});

describe("intervalFrom", () => {

    it("keeps the current interval when the server names none", () => {
        expect(intervalFrom({}, 7 * MINUTE)).toBe(7 * MINUTE);
        expect(intervalFrom(null, 7 * MINUTE)).toBe(7 * MINUTE);
    });

    it("holds a requested interval within bounds", () => {
        expect(intervalFrom({ nextReportAfterSeconds: 1 }, 0)).toBe(MIN_REPORT_INTERVAL_MS);
        expect(intervalFrom({ nextReportAfterSeconds: 10 * 24 * 3600 }, 0)).toBe(MAX_REPORT_INTERVAL_MS);
    });
});

describe("localDay", () => {

    it("is the browser's local date, not the UTC one", () => {
        expect(localDay(new Date(2026, 8, 28, 23, 59).getTime())).toBe("2026-09-28");
        expect(localDay(new Date(2026, 8, 29, 0, 1).getTime())).toBe("2026-09-29");
    });
});

describe("the default", () => {

    it("reports every fifteen minutes until the server says otherwise", () => {
        expect(DEFAULT_REPORT_INTERVAL_MS).toBe(15 * MINUTE);
    });
});
