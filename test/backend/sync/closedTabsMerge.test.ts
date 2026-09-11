import { describe, expect, it } from "vitest";

import { mergeClosedTabs } from "../../../src/backend/sync/SyncCoordinator";
import { ClosedTab } from "../../../src/backend/entity/ClosedTabEntity";

const tab = (id: string, url: string, closedAt: number, extras: Partial<ClosedTab> = {}):
    ClosedTab => ({ id, url, title: "A page", closedAt, ...extras });

const byId = (tabs: ClosedTab[]) => Object.fromEntries(tabs.map(one => [one.id, one]));

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

    it("keeps one entry when both ends hold the same row", () => {
        const shared = tab("shared", "https://example.com/", 1000);

        expect(Object.keys(mergeClosedTabs(byId([shared]), byId([shared])))).toEqual(["shared"]);
    });

    it("keeps everything, and trims nothing", () => {
        // The trimming that used to be here is what made every synchronisation find something
        // to say: a device holding less than the account holds reports the difference, and the
        // report draws a notification that sets the other device reporting too. The list is
        // kept in bounds where it is written to, and made readable where it is drawn.
        const local = Array.from({ length: 40 }, (_, i) =>
            tab(`l-${i}`, `https://local.test/${i}`, i));
        const remote = Array.from({ length: 40 }, (_, i) =>
            tab(`r-${i}`, `https://remote.test/${i}`, 100 + i));

        expect(Object.keys(mergeClosedTabs(byId(local), byId(remote)))).toHaveLength(80);
    });

    it("keeps both rows when two devices closed the same page", () => {
        // They are two records, and the account holds both. Which of them a reader should see
        // is the panel's question, not this one's.
        const merged = mergeClosedTabs(
            byId([tab("local", "https://example.com/", 3000)]),
            byId([tab("remote", "https://example.com/", 1000)]));

        expect(Object.keys(merged).sort()).toEqual(["local", "remote"]);
    });
});
