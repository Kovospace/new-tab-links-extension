import { describe, expect, it } from "vitest";

import { ProfileMergeEngine } from "./ProfileMergeEngine";
import { environment, group, link, profileOf, subgroup } from "../../test/profileDataFixtures";

const titlesOf = (links: Record<string, { title: string }>): string[] =>
    Object.values(links).map(one => one.title).sort();

describe("ProfileMergeEngine", () => {

    it("keeps one copy of a link the account already has", () => {
        const shared = (id: string) =>
            profileOf({ links: [link(id, "Docs", "https://docs.test", "grp", "env")] });

        const merged = ProfileMergeEngine.merge(shared("local"), shared("remote"));

        expect(Object.keys(merged.merged.links)).toEqual(["remote"]);
        expect(merged.adoptedIds["local"]).toBe("remote");
    });

    it("keeps both links when they share a URL under different names", () => {
        // Erring the safe way: wrongly keeping two leaves the user something to delete, while
        // wrongly merging two loses one of them for good.
        const local = profileOf({ links: [link("l", "Handbook", "https://docs.test", "g", "e")] });
        const remote = profileOf({ links: [link("r", "Docs", "https://docs.test", "g", "e")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(titlesOf(merged.merged.links)).toEqual(["Docs", "Handbook"]);
    });

    it("keeps both links when they share a name under different URLs", () => {
        const local = profileOf({ links: [link("l", "Docs", "https://one.test", "g", "e")] });
        const remote = profileOf({ links: [link("r", "Docs", "https://two.test", "g", "e")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.links).sort()).toEqual(["l", "r"]);
    });

    it("treats two links of the same name in different groups as different links", () => {
        const local = profileOf({ links: [link("l", "Docs", "https://d.test", "workGroup", "e")] });
        const remote = profileOf({ links: [link("r", "Docs", "https://d.test", "homeGroup", "e")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.links).sort()).toEqual(["l", "r"]);
    });

    it("pairs workspaces by name, case insensitively, and adopts the account's identifier", () => {
        // "Work" and "work" are the same workspace to a person; treating them otherwise
        // produces a duplicate on every second device.
        const local = profileOf({ environments: [environment("localId", "work")] });
        const remote = profileOf({ environments: [environment("remoteId", "Work")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.environments)).toEqual(["remoteId"]);
        expect(merged.adoptedIds["localId"]).toBe("remoteId");
    });

    it("compares addresses without folding their case", () => {
        // A URL path is case sensitive, so two genuinely different pages can differ only in
        // case and folding them together would destroy one of the user's links.
        const local = profileOf({ links: [link("l", "Docs", "https://d.test/A", "g", "e")] });
        const remote = profileOf({ links: [link("r", "Docs", "https://d.test/a", "g", "e")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.links).sort()).toEqual(["l", "r"]);
    });

    it("carries a local-only link across, repointed at the identifiers that survived", () => {
        const local = profileOf({
            environments: [environment("localEnv", "Default")],
            groups: [group("localGrp", "Work", "localEnv")],
            links: [link("mine", "Mine", "https://mine.test", "localGrp", "localEnv")]
        });
        const remote = profileOf({
            environments: [environment("remoteEnv", "Default")],
            groups: [group("remoteGrp", "Work", "remoteEnv")]
        });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(merged.merged.links["mine"].groupId).toBe("remoteGrp");
        expect(merged.merged.links["mine"].environmentId).toBe("remoteEnv");
    });

    it("keeps every record the account already held", () => {
        // The whole safety property: a merge may add, and may deduplicate, but the account's
        // own records all come out the other side.
        const local = profileOf({ links: [link("mine", "Mine", "https://mine.test", "g", "e")] });
        const remote = profileOf({
            environments: [environment("e", "Default")],
            groups: [group("g", "Work", "e")],
            subgroups: [subgroup("s", "Reading", "g", "e")],
            links: [link("theirs", "Theirs", "https://theirs.test", "g", "e")]
        });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(merged.merged.environments["e"]).toBeDefined();
        expect(merged.merged.groups["g"]).toBeDefined();
        expect(merged.merged.subgroups["s"]).toBeDefined();
        expect(Object.keys(merged.merged.links).sort()).toEqual(["mine", "theirs"]);
    });

    it("appends local additions after what the account already had", () => {
        const local = profileOf({ environments: [environment("mine", "Personal", 0)] });
        const remote = profileOf({ environments: [environment("theirs", "Work", 0)] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(merged.merged.environments["theirs"].order).toBe(0);
        expect(merged.merged.environments["mine"].order).toBe(1);
    });
});
