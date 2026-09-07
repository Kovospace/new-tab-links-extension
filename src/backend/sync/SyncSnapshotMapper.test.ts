import { describe, expect, it } from "vitest";

import { SyncSnapshotMapper } from "./SyncSnapshotMapper";
import { SnapshotSubgroupDto, SyncSnapshot } from "./SyncContracts";

const NOW = "2026-01-01T00:00:00Z";

const PROFILE = "0199aaaa-0000-7000-8000-00000000000a";
const ENVIRONMENT = "0199aaaa-0000-7000-8000-00000000000b";
const GROUP = "0199aaaa-0000-7000-8000-00000000000c";
const SUBGROUP = "0199aaaa-0000-7000-8000-00000000000d";

/** An account holding one subgroup, described however the test needs it described. */
function accountWithSubgroup(subgroup: Partial<SnapshotSubgroupDto>): SyncSnapshot {
    return {
        owner: { id: "owner", username: "kovo" },
        profiles: [{
            id: PROFILE, ownerId: "owner", name: "Default", position: 0,
            createdAt: NOW, updatedAt: NOW
        }],
        environments: [{
            id: ENVIRONMENT, ownerId: "owner", profileId: PROFILE, name: "Work",
            description: null, position: 0, createdAt: NOW, updatedAt: NOW
        }],
        groups: [{
            id: GROUP, environmentId: ENVIRONMENT, name: "One",
            description: null, position: 0, createdAt: NOW, updatedAt: NOW
        }],
        subgroups: [{
            id: SUBGROUP, parentGroupId: GROUP, name: "Reading", description: null,
            position: 0, collapsed: false, defaultCollapsed: false,
            createdAt: NOW, updatedAt: NOW,
            ...subgroup
        }],
        links: [],
        capturedAt: NOW
    };
}

const mappedSubgroup = (snapshot: SyncSnapshot) =>
    SyncSnapshotMapper.toProfiles(snapshot).dataByProfileId[PROFILE].subgroups[SUBGROUP];

/**
 *  Whether a subgroup catches tabs into its tab group is a property of the subgroup, not of
 *  the machine it was set on, so it travels in the snapshot with everything else. A pull
 *  writes a profile whole, which means anything the mapper does not carry over is a setting
 *  the user loses the moment another device synchronises.
 */
describe("SyncSnapshotMapper, the catch-links setting", () => {

    it("carries the setting down from the account", () => {
        expect(mappedSubgroup(accountWithSubgroup({ catchLinksIntoTabGroup: true }))
            .catchLinksIntoTabGroup).toBe(true);
    });

    it("carries it down turned off as readily as turned on", () => {
        expect(mappedSubgroup(accountWithSubgroup({ catchLinksIntoTabGroup: false }))
            .catchLinksIntoTabGroup).toBe(false);
    });

    it("reads a backend that does not know the field yet as not catching", () => {
        // The deployed backend has no column for this until it ships one, and until then it
        // simply omits the field. Undefined must not reach the service worker, which reads
        // the stored subgroup rather than a DTO.
        expect(mappedSubgroup(accountWithSubgroup({})).catchLinksIntoTabGroup).toBe(false);
    });
});
