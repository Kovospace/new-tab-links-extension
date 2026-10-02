import { describe, expect, it } from "vitest";

import { SyncSnapshotMapper } from "../../../src/backend/sync/SyncSnapshotMapper";
import { SnapshotProfileDto, SnapshotSubgroupDto, SyncSnapshot } from "../../../src/backend/sync/SyncContracts";

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
            .toEqual({ enableDragAndDrop: true, hideTips: false });
    });

    it("reads a backend that does not store settings yet as having the defaults", () => {
        // The field is absent, not false, and absent must not arrive as undefined: a profile
        // whose settings are undefined compares differently from one whose settings are the
        // defaults, and the difference would be pushed straight back.
        expect(mappedProfile(accountWithProfile({})).settings)
            .toEqual({ enableDragAndDrop: true, hideTips: false });
    });

    it("keeps an account that has them off, off", () => {
        expect(mappedProfile(accountWithProfile({ enableDragAndDrop: false })).settings)
            .toEqual({ enableDragAndDrop: false, hideTips: false });
    });
});

/**
 *  A subgroup's colour travels with the subgroup, like its title: the same subgroup should be
 *  the same colour in the tab strip on every machine.
 */
describe("SyncSnapshotMapper, subgroup colour", () => {

    it("takes the colour the account holds", () => {
        expect(mappedSubgroup(accountWithSubgroup({ color: "purple" })).color).toBe("purple");
    });

    it("leaves a subgroup the account has never coloured without one", () => {
        // Not a default: "never given one" is a real state, and the device that next changes
        // this subgroup is the one that assigns it a colour.
        expect(mappedSubgroup(accountWithSubgroup({ color: null })).color).toBeUndefined();
        expect(mappedSubgroup(accountWithSubgroup({})).color).toBeUndefined();
    });

    it("drops a colour this version does not know", () => {
        // The account may have been written by a newer version. The value is handed to
        // chrome.tabGroups, which refuses a name it does not know - so an unrecognised colour
        // must not be stored as if it were usable.
        expect(mappedSubgroup(accountWithSubgroup({ color: "chartreuse" })).color)
            .toBeUndefined();
    });
});

/**
 *  Closed tabs arrive as one flat collection naming their profile, like everything else in a
 *  snapshot, and are taken apart into the per-profile lists this extension stores.
 */
describe("SyncSnapshotMapper, closed tabs", () => {

    const withClosedTabs = (closedTabs: SyncSnapshot["closedTabs"]): SyncSnapshot => ({
        ...accountWithSubgroup({}),
        closedTabs
    });

    it("files each tab under the profile it names", () => {
        const mapped = SyncSnapshotMapper.toProfiles(withClosedTabs([{
            id: "tab-1", profileId: PROFILE, url: "https://example.com/", title: "Example",
            faviconUrl: null, closedAt: NOW, deviceName: "Laptop"
        }]));

        expect(mapped.closedTabsByProfileId[PROFILE]["tab-1"]).toEqual({
            id: "tab-1",
            url: "https://example.com/",
            title: "Example",
            faviconUrl: undefined,
            closedAt: Date.parse(NOW),
            deviceName: "Laptop"
        });
    });

    it("gives a profile with no closed tabs an empty list, not a missing one", () => {
        // The change set compares against this. A missing list would read as "nothing known"
        // and leave a device's own tabs unpushed for ever.
        const mapped = SyncSnapshotMapper.toProfiles(withClosedTabs([]));

        expect(mapped.closedTabsByProfileId[PROFILE]).toEqual({});
    });

    it("tells an account that keeps none apart from one that does not keep them", () => {
        // Present but empty is an account with no closed tabs; absent is a backend that has
        // never heard of them. Reading the second as the first is what made this device push
        // records the server could not parse, failing every push it made.
        expect(SyncSnapshotMapper.toProfiles(withClosedTabs([])).closedTabsSupported).toBe(true);
        expect(SyncSnapshotMapper.toProfiles(accountWithSubgroup({})).closedTabsSupported)
            .toBe(false);
    });

    it("holds no closed tabs for an account that does not keep them", () => {
        const mapped = SyncSnapshotMapper.toProfiles(accountWithSubgroup({}));

        expect(mapped.closedTabsByProfileId[PROFILE]).toEqual({});
    });

    it("drops a tab naming a profile the snapshot does not have", () => {
        // A straggler the account should have cascaded away. Keeping it would file it under a
        // profile that does not exist, where nothing would ever look at it again.
        const mapped = SyncSnapshotMapper.toProfiles(withClosedTabs([{
            id: "tab-1", profileId: "0199ffff-0000-7000-8000-00000000000f",
            url: "https://example.com/", title: "Example",
            faviconUrl: null, closedAt: NOW, deviceName: null
        }]));

        expect(Object.values(mapped.closedTabsByProfileId).flatMap(Object.keys)).toEqual([]);
    });
});
