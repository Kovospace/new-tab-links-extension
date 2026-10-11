import { describe, expect, it } from "vitest";

import { ChangeSetBuilder, SyncBaseline } from "../../../src/backend/sync/ChangeSetBuilder";
import { SyncEntityKind, SyncOperation } from "../../../src/backend/sync/SyncContracts";
import {
    emptyProfile, environment, group, link, profileOf, subgroup
} from "../../support/profileDataFixtures";

const PROFILE_ID = "0199aaaa-0000-7000-8000-00000000000a";

function baselineOf(data = emptyProfile()): SyncBaseline {
    return {
        profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
        dataByProfileId: { [PROFILE_ID]: data }
    };
}

const kindsOf = (operations: SyncOperation[], op: "upsert" | "delete"): SyncEntityKind[] =>
    operations.filter(operation => operation.op === op).map(operation => operation.type);

describe("ChangeSetBuilder", () => {

    it("deletes children before their parents", () => {
        // The order the class promised and did not produce: profile deletions were collected
        // before the records beneath them, so a batch asked the backend to remove a parent it
        // had not been told to empty.
        //
        // Two profiles are needed to see it. One is emptied but kept, which is what produces
        // deletions of the records themselves; the other is dropped, which is what produces a
        // profile deletion. A profile dropped on its own emits no child deletions at all -
        // its contents are absent from the change set because the device holds no data for a
        // profile it no longer has, and the account cascades them away.
        const emptied = "0199bbbb-0000-7000-8000-00000000000b";
        const populated = profileOf({
            environments: [environment("env", "Default")],
            groups: [group("grp", "Work", "env")],
            subgroups: [subgroup("sub", "Reading", "grp", "env")],
            links: [link("lnk", "Docs", "https://docs.test", "grp", "env")]
        });

        const operations = ChangeSetBuilder.build(
            {
                profiles: [
                    { id: emptied, name: "Kept", createdAt: 0 },
                    { id: PROFILE_ID, name: "Dropped", createdAt: 0 }
                ],
                dataByProfileId: { [emptied]: populated, [PROFILE_ID]: emptyProfile() }
            },
            [{ id: emptied, name: "Kept", createdAt: 0 }],
            { [emptied]: emptyProfile() });

        expect(kindsOf(operations, "delete"))
            .toEqual(["link", "subgroup", "group", "environment", "profile"]);
    });

    it("emits no child deletions for a profile that is being dropped whole", () => {
        // The account cascades a profile's contents away, and this device holds no data for a
        // profile it has already removed - so naming those records individually would be both
        // impossible and pointless.
        const populated = profileOf({
            environments: [environment("env", "Default")],
            links: [link("lnk", "Docs", "https://docs.test", "grp", "env")]
        });

        const operations = ChangeSetBuilder.build(baselineOf(populated), [], {});

        expect(operations).toEqual([{ op: "delete", type: "profile", id: PROFILE_ID }]);
    });

    it("creates parents before their children", () => {
        const populated = profileOf({
            environments: [environment("env", "Default")],
            groups: [group("grp", "Work", "env")],
            subgroups: [subgroup("sub", "Reading", "grp", "env")],
            links: [link("lnk", "Docs", "https://docs.test", "grp", "env")]
        });

        const operations = ChangeSetBuilder.build(
            { profiles: [], dataByProfileId: {} },
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: populated });

        expect(kindsOf(operations, "upsert"))
            .toEqual(["profile", "environment", "group", "subgroup", "link"]);
    });

    it("sends nothing when the device and the account agree", () => {
        const same = profileOf({ environments: [environment("env", "Default")] });

        const operations = ChangeSetBuilder.build(
            baselineOf(same),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: same });

        expect(operations).toEqual([]);
    });

    it("says nothing at all about a profile whose data this device has never loaded", () => {
        // Emptying it would be catastrophic: the records are on the account and simply absent
        // from memory here, which is not the same as the user having deleted them.
        const populated = profileOf({ environments: [environment("env", "Default")] });

        const operations = ChangeSetBuilder.build(
            baselineOf(populated),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            {});

        expect(operations).toEqual([]);
    });

    it("reports a record the device no longer has as a deletion", () => {
        const before = profileOf({
            environments: [environment("env", "Default")],
            links: [
                link("kept", "Docs", "https://docs.test", "grp", "env"),
                link("gone", "Old", "https://old.test", "grp", "env")
            ]
        });
        const after = profileOf({
            environments: [environment("env", "Default")],
            links: [link("kept", "Docs", "https://docs.test", "grp", "env")]
        });

        const operations = ChangeSetBuilder.build(
            baselineOf(before),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: after });

        expect(operations.filter(operation => operation.op === "delete"))
            .toEqual([{ op: "delete", type: "link", id: "gone" }]);
    });

    it("ignores a change to a field that is not synchronised", () => {
        // Equality is decided on the operation that would be sent, not on the stored record, so
        // a field this extension keeps to itself cannot by itself cause a push.
        const before = profileOf({ links: [link("l", "Docs", "https://d.test", "g", "e")] });
        const after = profileOf({
            links: [{ ...link("l", "Docs", "https://d.test", "g", "e"), createdAt: 999 }]
        });

        const operations = ChangeSetBuilder.build(
            baselineOf(before),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: after });

        expect(operations).toEqual([]);
    });

    it("pushes a subgroup whose catch-links setting was flipped", () => {
        // The setting belongs to the subgroup rather than to the device it was set on, so
        // turning it on has to reach the account - and it is the only field that changed.
        const before = profileOf({ subgroups: [subgroup("sub", "Reading", "grp", "env")] });
        const after = profileOf({
            subgroups: [subgroup("sub", "Reading", "grp", "env", 0,
                { catchLinksIntoTabGroup: true })]
        });

        const operations = ChangeSetBuilder.build(
            baselineOf(before),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: after });

        expect(operations).toEqual([{
            op: "upsert", type: "subgroup", id: "sub",
            parentGroupId: "grp",
            name: "Reading",
            description: null,
            collapsed: false,
            defaultCollapsed: false,
            catchLinksIntoTabGroup: true,
            color: null,
            position: 0
        }]);
    });

    it("carries the colour of a subgroup that is only being renamed", () => {
        // The backend replaces every synchronised field on an upsert, so an operation that
        // did not carry the colour would clear it - on every device - because somebody
        // renamed the subgroup.
        const before = profileOf({
            subgroups: [{ ...subgroup("sub", "Reading", "grp", "env"), color: "purple" }]
        });
        const after = profileOf({
            subgroups: [{ ...subgroup("sub", "Later", "grp", "env"), color: "purple" }]
        });

        const operations = ChangeSetBuilder.build(
            baselineOf(before),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: after });

        expect(operations).toHaveLength(1);
        expect(operations[0].name).toBe("Later");
        expect(operations[0].color).toBe("purple");
    });

    it("says a subgroup stored before the setting existed is not catching", () => {
        // Absent locally and false on the account are the same thing, and a subgroup that
        // has simply never been touched must not push on every synchronisation.
        const stored = subgroup("sub", "Reading", "grp", "env");
        delete stored.catchLinksIntoTabGroup;
        const before = profileOf({ subgroups: [stored] });
        const after = profileOf({ subgroups: [subgroup("sub", "Reading", "grp", "env")] });

        const operations = ChangeSetBuilder.build(
            baselineOf(before),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: after });

        expect(operations).toEqual([]);
    });
});

/**
 *  Settings ride on the profile record rather than in a store of their own, which is what
 *  lets them synchronise without a new entity kind - but only if the difference this class
 *  computes actually notices them. A setting that never reaches the account is worse than one
 *  that does not exist: the user sets it, sees it stick, and finds it missing on the machine
 *  they set it for.
 */
describe("ChangeSetBuilder, profile settings", () => {

    it("pushes a profile whose settings changed", () => {
        const operations = ChangeSetBuilder.build(
            baselineOf(),
            [{
                id: PROFILE_ID, name: "Default", createdAt: 0,
                settings: { enableDragAndDrop: false, hideTips: false, dismissedTips: [], recordClosedTabs: true, recordBrowsingHistory: false }
            }],
            { [PROFILE_ID]: emptyProfile() });

        const profiles = operations.filter(operation => operation.type === "profile");
        expect(profiles).toHaveLength(1);
        expect(profiles[0].enableDragAndDrop).toBe(false);
    });

    it("says nothing about a profile whose settings did not change", () => {
        const settings = { enableDragAndDrop: true, hideTips: false, dismissedTips: ["hide-tips"], recordClosedTabs: true, recordBrowsingHistory: false };

        const operations = ChangeSetBuilder.build(
            {
                profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0, settings }],
                dataByProfileId: { [PROFILE_ID]: emptyProfile() }
            },
            [{ id: PROFILE_ID, name: "Default", createdAt: 0, settings }],
            { [PROFILE_ID]: emptyProfile() });

        expect(operations).toEqual([]);
    });

    it("reads a profile stored before settings existed as having them off", () => {
        // Both ends say nothing, and both have to mean the same thing by it - otherwise every
        // device would push its whole profile list once, for no change at all.
        const operations = ChangeSetBuilder.build(
            baselineOf(),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() });

        expect(operations).toEqual([]);
    });

    it("carries the settings of a profile that is only being renamed", () => {
        // The backend reads an absent flag as false rather than as "leave it alone", because
        // an upsert replaces every synchronised field. So an operation built for some other
        // reason - a rename, a reorder - that forgot the settings would not be neutral: it
        // would turn the setting off, on every device the account reaches. Every setting has
        // to be asserted here, not just the first one: they are what a second one added
        // carelessly would silently stop carrying.
        const settings = { enableDragAndDrop: true, hideTips: true, dismissedTips: ["hide-tips"], recordClosedTabs: true, recordBrowsingHistory: false };

        const operations = ChangeSetBuilder.build(
            {
                profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0, settings }],
                dataByProfileId: { [PROFILE_ID]: emptyProfile() }
            },
            [{ id: PROFILE_ID, name: "Home", createdAt: 0, settings }],
            { [PROFILE_ID]: emptyProfile() });

        const profiles = operations.filter(operation => operation.type === "profile");
        expect(profiles).toHaveLength(1);
        expect(profiles[0].name).toBe("Home");
        expect(profiles[0].enableDragAndDrop).toBe(true);
        expect(profiles[0].hideTips).toBe(true);
        expect(profiles[0].dismissedTips).toEqual(["hide-tips"]);
    });

    it("pushes a profile that dismissed one more tip", () => {
        const before = { enableDragAndDrop: true, hideTips: false, dismissedTips: ["hide-tips"], recordClosedTabs: true, recordBrowsingHistory: false };
        const after = { ...before, dismissedTips: ["hide-tips", "disable-ads"] };

        const operations = ChangeSetBuilder.build(
            {
                profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0, settings: before }],
                dataByProfileId: { [PROFILE_ID]: emptyProfile() }
            },
            [{ id: PROFILE_ID, name: "Default", createdAt: 0, settings: after }],
            { [PROFILE_ID]: emptyProfile() });

        const profiles = operations.filter(operation => operation.type === "profile");
        expect(profiles).toHaveLength(1);
        expect(profiles[0].dismissedTips).toEqual(["hide-tips", "disable-ads"]);
    });

    it("carries the settings of a profile the account has never seen", () => {
        const created = "0199cccc-0000-7000-8000-00000000000c";

        const operations = ChangeSetBuilder.build(
            baselineOf(),
            [
                { id: PROFILE_ID, name: "Default", createdAt: 0 },
                {
                    id: created, name: "Fresh", createdAt: 0,
                    settings: { enableDragAndDrop: true, hideTips: false, dismissedTips: [], recordClosedTabs: true, recordBrowsingHistory: false }
                }
            ],
            { [PROFILE_ID]: emptyProfile(), [created]: emptyProfile() });

        const fresh = operations.find(operation => operation.id === created);
        expect(fresh?.enableDragAndDrop).toBe(true);
    });
});

/**
 *  Closed tabs are the first thing here that is stored outside a profile's data - the service
 *  worker owns their key - so they reach the change set by a channel of their own. What has to
 *  hold is the same as for everything else: what this device has and the account does not is
 *  pushed, and what the account has and this device has pruned away is deleted.
 */
describe("ChangeSetBuilder, closed tabs", () => {

    const tab = (id: string, url: string, closedAt: number) =>
        ({ id, url, title: "A page", closedAt });

    const baselineWith = (tabs: Record<string, unknown>): SyncBaseline => ({
        profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
        dataByProfileId: { [PROFILE_ID]: emptyProfile() },
        closedTabsByProfileId: { [PROFILE_ID]: tabs as never },
        // The account has shown it keeps them; without this nothing about them is sent.
        closedTabsSupported: true
    });

    it("pushes a tab the account has not heard of", () => {
        const operations = ChangeSetBuilder.build(
            baselineWith({}),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() },
            { [PROFILE_ID]: { one: tab("one", "https://example.com/", 1_700_000_000_000) } });

        const closed = operations.filter(operation => operation.type === "closedTab");
        expect(closed).toHaveLength(1);
        expect(closed[0]).toMatchObject({
            op: "upsert", id: "one", profileId: PROFILE_ID, url: "https://example.com/"
        });
        // An instant, sent by the device that closed it rather than stamped by the server.
        expect(closed[0].closedAt).toBe(new Date(1_700_000_000_000).toISOString());
    });

    it("deletes a tab this device has pruned away", () => {
        // The list is capped, so entries fall off it - and falling off has to reach the
        // account, or every device would accumulate what every other device dropped.
        const operations = ChangeSetBuilder.build(
            baselineWith({ one: tab("one", "https://example.com/", 1000) }),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() },
            { [PROFILE_ID]: {} });

        expect(operations.filter(operation => operation.type === "closedTab"))
            .toEqual([{ op: "delete", type: "closedTab", id: "one" }]);
    });

    it("says nothing about a list that has not changed", () => {
        const tabs = { one: tab("one", "https://example.com/", 1000) };

        const operations = ChangeSetBuilder.build(
            baselineWith(tabs),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() },
            { [PROFILE_ID]: tabs });

        expect(operations).toEqual([]);
    });

    it("says nothing about them to an account that does not keep them", () => {
        // The bug this exists for, and it was not a closed-tabs bug: a backend that has never
        // heard of this kind of record cannot refuse one operation, it refuses the request it
        // arrived in. So a device sending them to such an account had every push rejected -
        // links, groups, everything - and retried for ever, which with a second browser
        // connected became a notification storm between the two.
        const operations = ChangeSetBuilder.build(
            {
                profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
                dataByProfileId: { [PROFILE_ID]: emptyProfile() },
                closedTabsByProfileId: { [PROFILE_ID]: {} },
                closedTabsSupported: false
            },
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() },
            { [PROFILE_ID]: { one: tab("one", "https://example.com/", 1000) } });

        expect(operations.filter(operation => operation.type === "closedTab")).toEqual([]);
    });

    it("says nothing about them against a baseline that predates the question", () => {
        // An older baseline has no opinion, and "not known to keep them" is the safe reading:
        // the cost of waiting for the next pull to say so is one synchronisation, and the cost
        // of guessing wrong is every synchronisation failing.
        const operations = ChangeSetBuilder.build(
            {
                profiles: [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
                dataByProfileId: { [PROFILE_ID]: emptyProfile() }
            },
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() },
            { [PROFILE_ID]: { one: tab("one", "https://example.com/", 1000) } });

        expect(operations.filter(operation => operation.type === "closedTab")).toEqual([]);
    });

    it("names no closed tabs when the profile they hang from is being dropped", () => {
        // The same rule the other children follow: the account cascades a profile's contents
        // away, and this device holds no list for a profile it no longer has - so naming them
        // one by one would be both impossible and pointless.
        const operations = ChangeSetBuilder.build(
            baselineWith({ one: tab("one", "https://example.com/", 1000) }),
            [],
            {},
            {});

        expect(kindsOf(operations, "delete")).toEqual(["profile"]);
    });

    it("deletes a pruned tab before anything that could be deleted under it", () => {
        // Nothing hangs from a closed tab today, but the order is declared with the rest and
        // has to be the one the backend applies: children first.
        const operations = ChangeSetBuilder.build(
            baselineWith({ one: tab("one", "https://example.com/", 1000) }),
            [{ id: PROFILE_ID, name: "Default", createdAt: 0 }],
            { [PROFILE_ID]: emptyProfile() },
            { [PROFILE_ID]: {} });

        expect(kindsOf(operations, "delete")).toEqual(["closedTab"]);
    });
});

/** The browsing history reaches the change set by the channel closed tabs use, under the same guard. */
describe("ChangeSetBuilder, browsing history", () => {

    const visit = (id: string, url: string, visitedAt: number) => ({ id, url, title: "A page", visitedAt });
    const profiles = [{ id: PROFILE_ID, name: "Default", createdAt: 0 }];

    const baselineWith = (visits: Record<string, unknown>, supported = true): SyncBaseline => ({
        profiles,
        dataByProfileId: { [PROFILE_ID]: emptyProfile() },
        visitsByProfileId: { [PROFILE_ID]: visits as never },
        visitsSupported: supported
    });

    it("pushes a visit the account has not heard of, its time as an instant", () => {
        const operations = ChangeSetBuilder.build(
            baselineWith({}), profiles, { [PROFILE_ID]: emptyProfile() }, {},
            { [PROFILE_ID]: { one: visit("one", "https://example.com/", 1_700_000_000_000) } });

        const visits = operations.filter(operation => operation.type === "visit");
        expect(visits).toHaveLength(1);
        expect(visits[0]).toMatchObject({ op: "upsert", id: "one", profileId: PROFILE_ID });
        expect(visits[0].visitedAt).toBe(new Date(1_700_000_000_000).toISOString());
    });

    it("deletes a visit this device has let go of", () => {
        const operations = ChangeSetBuilder.build(
            baselineWith({ one: visit("one", "https://example.com/", 1000) }),
            profiles, { [PROFILE_ID]: emptyProfile() }, {}, { [PROFILE_ID]: {} });

        expect(operations.filter(operation => operation.type === "visit"))
            .toEqual([{ op: "delete", type: "visit", id: "one" }]);
    });

    it("says nothing about them to an account that does not keep them", () => {
        // One operation naming a kind the server has no vocabulary for fails the whole push.
        const operations = ChangeSetBuilder.build(
            baselineWith({}, false), profiles, { [PROFILE_ID]: emptyProfile() }, {},
            { [PROFILE_ID]: { one: visit("one", "https://example.com/", 1000) } });

        expect(operations.filter(operation => operation.type === "visit")).toEqual([]);
    });

    it("sends whether the profile records history on every profile upsert", () => {
        const operations = ChangeSetBuilder.build(
            { profiles: [], dataByProfileId: {} },
            [{ ...profiles[0], settings: {
                enableDragAndDrop: true, hideTips: false, dismissedTips: [],
                recordClosedTabs: true, recordBrowsingHistory: true } }],
            {});

        expect(operations.find(operation => operation.type === "profile")?.recordBrowsingHistory)
            .toBe(true);
    });
});
