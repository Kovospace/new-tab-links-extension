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
});
