import { describe, expect, it } from "vitest";

import { buildInventory, InventoryReporter } from "../../../src/backend/sync/InventoryReporter";
import { ApiResult } from "../../../src/backend/sync/BackendApiClient";
import { DeviceInventoryDto } from "../../../src/backend/sync/SyncContracts";
import { LocalProfile } from "../../../src/backend/sync/SyncSlots";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";

const local: LocalProfile[] = [{
    meta: { id: "p", name: "Default", createdAt: 0 },
    data: profileOf({
        environments: [environment("w1", "Synced", 0), environment("w2", "Local", 1)],
        groups: [group("g", "Secret group name", "w1")],
        links: [link("l", "Secret title", "https://secret.example/", "g", "w1")]
    })
}];
const scope = {
    accountId: "owner",
    profiles: { p: { state: "SYNCHRONISED" as const } },
    workspaces: { w1: { state: "SYNCHRONISED" as const }, w2: { state: "LOCAL_ONLY_FREE_LIMIT" as const } }
};
const account = { profiles: [{ id: "p", name: "Default", createdAt: 0, position: 0 }],
    workspaces: [{ id: "w1", profileId: "p", name: "Synced", createdAt: 0, position: 0 }] };

describe("the inventory report", () => {

    it("carries names, counts and states only - never a group name, a title or an address", () => {
        const inventory = buildInventory(local, scope, account);

        expect(inventory).toEqual({
            profiles: [{
                accountId: "p", name: "Default", syncState: "SYNCHRONISED",
                workspaces: [
                    { accountId: "w1", name: "Synced", syncState: "SYNCHRONISED", groupCount: 1, subgroupCount: 0, linkCount: 1 },
                    { accountId: null, name: "Local", syncState: "LOCAL_ONLY_FREE_LIMIT", groupCount: 0, subgroupCount: 0, linkCount: 0 }
                ]
            }]
        });
        expect(JSON.stringify(inventory)).not.toMatch(/Secret|secret\.example/);
    });

    it("is sent again only when it changed", async () => {
        const sent: DeviceInventoryDto[] = [];
        const reporter = new InventoryReporter({
            reportInventory: (inventory: DeviceInventoryDto) => {
                sent.push(inventory);
                return Promise.resolve({ outcome: "success", data: undefined } as ApiResult<void>);
            }
        });

        await reporter.report("owner", local, scope, account);
        await reporter.report("owner", local, scope, account);
        await reporter.report("owner", local, { ...scope, workspaces: { ...scope.workspaces, w2: { state: "SYNCHRONISED" } } }, account);

        expect(sent).toHaveLength(2);
    });
});
