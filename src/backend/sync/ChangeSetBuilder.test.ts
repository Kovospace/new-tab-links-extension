import { describe, expect, it } from "vitest";

import { ChangeSetBuilder, SyncBaseline } from "./ChangeSetBuilder";
import { SyncEntityKind, SyncOperation } from "./SyncContracts";
import {
    emptyProfile, environment, group, link, profileOf, subgroup
} from "../../test/profileDataFixtures";

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
                settings: { enableDragAndDrop: true }
            }],
            { [PROFILE_ID]: emptyProfile() });

        const profiles = operations.filter(operation => operation.type === "profile");
        expect(profiles).toHaveLength(1);
        expect(profiles[0].enableDragAndDrop).toBe(true);
    });

    it("says nothing about a profile whose settings did not change", () => {
        const settings = { enableDragAndDrop: true };

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
        // would turn the setting off, on every device the account reaches.
        const settings = { enableDragAndDrop: true };

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
    });

    it("carries the settings of a profile the account has never seen", () => {
        const created = "0199cccc-0000-7000-8000-00000000000c";

        const operations = ChangeSetBuilder.build(
            baselineOf(),
            [
                { id: PROFILE_ID, name: "Default", createdAt: 0 },
                {
                    id: created, name: "Fresh", createdAt: 0,
                    settings: { enableDragAndDrop: true }
                }
            ],
            { [PROFILE_ID]: emptyProfile(), [created]: emptyProfile() });

        const fresh = operations.find(operation => operation.id === created);
        expect(fresh?.enableDragAndDrop).toBe(true);
    });
});
