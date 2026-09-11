import { describe, expect, it } from "vitest";

import { capClosedTabs, mergeClosedTabs } from "./SyncCoordinator";
import { ClosedTab, MAX_CLOSED_TABS } from "../entity/ClosedTabEntity";

const tab = (id: string, url: string, closedAt: number, extras: Partial<ClosedTab> = {}):
    ClosedTab => ({ id, url, title: "A page", closedAt, ...extras });

const byId = (tabs: ClosedTab[]) => Object.fromEntries(tabs.map(one => [one.id, one]));

/**
 *  What a pulled list is put through before this device believes it. The account cannot do
 *  any of this for itself: it has no cap, it cannot have a unique constraint on the address
 *  without making a legitimate push fail, and it takes the closing time from whichever device
 *  reported it.
 */
describe("capClosedTabs", () => {

    it("keeps the newest, and only as many as this device keeps", () => {
        const many = Array.from({ length: MAX_CLOSED_TABS + 10 }, (_, index) =>
            tab(`id-${index}`, `https://example.com/${index}`, index));

        const kept = capClosedTabs(byId(many));

        expect(Object.keys(kept)).toHaveLength(MAX_CLOSED_TABS);
        expect(kept[`id-${MAX_CLOSED_TABS + 9}`]).toBeTruthy();
        expect(kept["id-0"]).toBeUndefined();
    });

    it("keeps one row for a page two devices closed", () => {
        // Two devices closing the same page record it under two identifiers, and the backend
        // has no unique constraint to stop that - so the panel would show it twice.
        const kept = capClosedTabs(byId([
            tab("from-laptop", "https://example.com/page", 1000),
            tab("from-desktop", "https://example.com/page", 2000)
        ]));

        expect(Object.keys(kept)).toEqual(["from-desktop"]);
    });

    it("treats the same page reached two ways as one page", () => {
        const kept = capClosedTabs(byId([
            tab("one", "https://example.com/page", 1000),
            tab("two", "https://example.com/page/", 2000)
        ]));

        expect(Object.keys(kept)).toHaveLength(1);
    });

    it("disbelieves a tab closed in the far future", () => {
        // A machine with a wrong clock can otherwise pin one row to the top of the list for
        // ever, on every device the account reaches.
        const year58664 = 1_789_117_200_000_000;

        const kept = capClosedTabs(byId([tab("broken", "https://example.com/", year58664)]));

        expect(kept["broken"].closedAt).toBeLessThanOrEqual(Date.now());
    });

    it("believes a clock that is merely a little fast", () => {
        // Two clocks legitimately differ; a tab closed a moment ago on a machine running a
        // minute ahead is not a fault, and rewriting its time would reorder the list.
        const slightlyAhead = Date.now() + 60_000;

        const kept = capClosedTabs(byId([tab("fine", "https://example.com/", slightlyAhead)]));

        expect(kept["fine"].closedAt).toBe(slightlyAhead);
    });
});

/**
 *  First contact with an account, which for this one record kind joins rather than replaces:
 *  both lists are logs of things that really happened, on machines that have never met.
 */
describe("mergeClosedTabs", () => {

    it("keeps what each end has that the other does not", () => {
        const merged = mergeClosedTabs(
            byId([tab("local", "https://local.test/", 1000)]),
            byId([tab("remote", "https://remote.test/", 2000)]));

        expect(Object.keys(merged).sort()).toEqual(["local", "remote"]);
    });

    it("keeps the later closing of a page both ends have", () => {
        const merged = mergeClosedTabs(
            byId([tab("local", "https://example.com/", 3000)]),
            byId([tab("remote", "https://example.com/", 1000)]));

        expect(Object.keys(merged)).toEqual(["local"]);
    });

    it("keeps one entry when both ends hold the same row", () => {
        const shared = tab("shared", "https://example.com/", 1000);

        expect(Object.keys(mergeClosedTabs(byId([shared]), byId([shared])))).toEqual(["shared"]);
    });

    it("caps the joined list", () => {
        const local = Array.from({ length: 40 }, (_, i) =>
            tab(`l-${i}`, `https://local.test/${i}`, i));
        const remote = Array.from({ length: 40 }, (_, i) =>
            tab(`r-${i}`, `https://remote.test/${i}`, 100 + i));

        expect(Object.keys(mergeClosedTabs(byId(local), byId(remote))))
            .toHaveLength(MAX_CLOSED_TABS);
    });
});
