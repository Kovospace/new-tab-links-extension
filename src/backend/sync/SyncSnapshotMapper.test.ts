import { describe, expect, it } from "vitest";

import { SyncSnapshotMapper } from "./SyncSnapshotMapper";
import { SnapshotProfileDto, SnapshotSubgroupDto, SyncSnapshot } from "./SyncContracts";

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

/** An account holding one profile, described however the test needs it described. */
function accountWithProfile(profile: Partial<SnapshotProfileDto>): SyncSnapshot {
    return {
        owner: { id: "owner", username: "kovo" },
        profiles: [{
            id: PROFILE, ownerId: "owner", name: "Default", position: 0,
            createdAt: NOW, updatedAt: NOW,
            ...profile
        }],
        environments: [],
        groups: [],
        subgroups: [],
        links: [],
        capturedAt: NOW
    };
}

const mappedProfile = (snapshot: SyncSnapshot) =>
    SyncSnapshotMapper.toProfiles(snapshot).profiles[0];

/**
 *  A profile's settings arrive on the profile record, which is the whole reason they need no
 *  entity kind of their own. A pull replaces a profile wholesale, so a mapper that dropped
 *  them would turn every setting off again on the next pull - and the pull that follows every
 *  push means the user would watch it happen seconds after setting it.
 */
describe("SyncSnapshotMapper, profile settings", () => {

    it("takes the settings the account holds", () => {
        expect(mappedProfile(accountWithProfile({ enableDragAndDrop: true })).settings)
            .toEqual({ enableDragAndDrop: true });
    });

    it("reads a backend that does not store settings yet as having them off", () => {
        // The field is absent, not false, and absent must not arrive as undefined: a profile
        // whose settings are undefined compares differently from one whose settings are the
        // defaults, and the difference would be pushed straight back.
        expect(mappedProfile(accountWithProfile({})).settings)
            .toEqual({ enableDragAndDrop: false });
    });

    it("keeps an account that has them off, off", () => {
        expect(mappedProfile(accountWithProfile({ enableDragAndDrop: false })).settings)
            .toEqual({ enableDragAndDrop: false });
    });
});
