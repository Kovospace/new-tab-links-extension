import { describe, expect, it } from "vitest";

import { SyncBaselineRepository } from "../../../src/backend/sync/SyncBaselineRepository";
import { SyncBaseline } from "../../../src/backend/sync/ChangeSetBuilder";
import { readFakeStorage, seedFakeStorage } from "../../support/chromeStorageStub";

const BASELINE: SyncBaseline = {
    profiles: [],
    dataByProfileId: {},
    closedTabsByProfileId: {},
    closedTabsSupported: true
};

describe("SyncBaselineRepository", () => {

    it("keeps one baseline per account, so another account's sync does not erase it", async () => {
        const baselines = new SyncBaselineRepository();
        await baselines.init();

        await baselines.store("alice", BASELINE);
        await baselines.store("bob", { ...BASELINE, closedTabsSupported: false });

        const reread = new SyncBaselineRepository();
        await reread.init();
        expect(reread.getFor("alice")).toEqual(BASELINE);
        expect(reread.getFor("bob")?.closedTabsSupported).toBe(false);
        expect(reread.getFor("carol")).toBeNull();
    });

    it("reads a baseline stored in the older single-account shape as that account's", async () => {
        seedFakeStorage("sync_baseline", { accountUserId: "alice", ...BASELINE });

        const baselines = new SyncBaselineRepository();
        await baselines.init();
        await baselines.store("bob", BASELINE);

        expect(baselines.getFor("alice")).toEqual(BASELINE);
        expect(readFakeStorage<Record<string, SyncBaseline>>("sync_baseline"))
            .toEqual({ alice: BASELINE, bob: BASELINE });
    });
});
