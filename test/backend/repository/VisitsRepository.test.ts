import { describe, expect, it } from "vitest";

import {
    newestVisitsFirst, readVisits, recordVisit
} from "../../../src/backend/repository/VisitsRepository";

const PROFILE = "0199aaaa-0000-7000-8000-0000000000p1";

/** A moment on a given local day, so "the same day" means the same thing in any time zone. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

const urls = async () => newestVisitsFirst(await readVisits(PROFILE)).map(visit => visit.url);

/**
 *  The browsing history keeps one entry per page per day, rolls at the plan's cap, and is
 *  written through a queue, because a burst of navigations reaches the worker at once.
 */
describe("recordVisit", () => {

    it("keeps one entry per page per day, moved to the latest visit", async () => {
        const first = await recordVisit(PROFILE, { url: "https://example.com/a", title: "A", visitedAt: at(5, 9) }, 50);
        const again = await recordVisit(PROFILE, { url: "https://example.com/a/", title: "A", visitedAt: at(5, 17) }, 50);

        const stored = Object.values(await readVisits(PROFILE));
        expect(stored).toHaveLength(1);
        // The same row, so the account is sent an update rather than a row more.
        expect(again?.id).toBe(first?.id);
        expect(stored[0].visitedAt).toBe(at(5, 17));
    });

    it("adds a new entry for the same page on another day", async () => {
        await recordVisit(PROFILE, { url: "https://example.com/a", title: "A", visitedAt: at(4, 9) }, 50);
        await recordVisit(PROFILE, { url: "https://example.com/a", title: "A", visitedAt: at(5, 9) }, 50);

        expect(Object.keys(await readVisits(PROFILE))).toHaveLength(2);
    });

    it("keeps the title an earlier report gave when a later one has none", async () => {
        await recordVisit(PROFILE, { url: "https://example.com/a", title: "Titled", visitedAt: at(5, 9) }, 50);
        await recordVisit(PROFILE, { url: "https://example.com/a", title: "", visitedAt: at(5, 10) }, 50);

        expect(Object.values(await readVisits(PROFILE))[0].title).toBe("Titled");
    });

    it("drops the oldest once the plan's cap is reached", async () => {
        for (let minute = 0; minute < 4; minute++) {
            await recordVisit(PROFILE,
                { url: `https://example.com/${minute}`, title: "", visitedAt: at(5, 9, minute) }, 3);
        }

        expect(await urls()).toEqual(
            ["https://example.com/3", "https://example.com/2", "https://example.com/1"]);
    });

    it("loses nothing when visits arrive together", async () => {
        await Promise.all([1, 2, 3, 4, 5].map(index => recordVisit(PROFILE,
            { url: `https://example.com/${index}`, title: "", visitedAt: at(5, 9, index) }, 50)));

        expect(await urls()).toHaveLength(5);
    });

    it("cuts a long title to what the account accepts and refuses an address it cannot take", async () => {
        await recordVisit(PROFILE,
            { url: "https://example.com/long", title: "x".repeat(300), visitedAt: at(5, 9) }, 50);
        const refused = await recordVisit(PROFILE,
            { url: "https://example.com/" + "y".repeat(2100), title: "", visitedAt: at(5, 9) }, 50);

        expect(Object.values(await readVisits(PROFILE))[0].title).toHaveLength(200);
        expect(refused).toBeNull();
    });
});
