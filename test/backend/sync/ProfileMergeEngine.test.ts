import { describe, expect, it } from "vitest";

import { ProfileMergeEngine } from "../../../src/backend/sync/ProfileMergeEngine";
import { environment, group, link, profileOf, subgroup } from "../../support/profileDataFixtures";

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

/**
 *  A device that synchronised this account once and then signed out keeps the account's
 *  identifiers - signing out clears the baseline and deliberately keeps the data - so signing
 *  back in merges two copies of the same records rather than two strangers.
 *
 *  Every test here is a rename or a move that another device made in the meantime. Pairing by
 *  name could not see any of them: the name lookup missed, the local copy was carried over
 *  under the identifier it shared with the account's record, and it overwrote it in the merged
 *  map. The merge then pushed that as an upsert - first contact withholds deletions, not
 *  upserts - and the device that made the edit pulled its own work away.
 */
describe("ProfileMergeEngine, a device rejoining an account it once synchronised", () => {

    const ENV = "0199aaaa-0000-7000-8000-00000000e001";
    const GRP = "0199aaaa-0000-7000-8000-000000009001";
    const SUB = "0199aaaa-0000-7000-8000-000000008001";
    const LNK = "0199aaaa-0000-7000-8000-000000007001";

    it("takes the account's name for a workspace this device renamed elsewhere", () => {
        const local = profileOf({ environments: [environment(ENV, "Work")] });
        const remote = profileOf({ environments: [environment(ENV, "Job")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.environments)).toEqual([ENV]);
        expect(merged.merged.environments[ENV].name).toBe("Job");
    });

    it("takes the account's title for a group renamed elsewhere", () => {
        const local = profileOf({ groups: [group(GRP, "Work stuff", ENV)] });
        const remote = profileOf({ groups: [group(GRP, "Job", ENV)] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.groups)).toEqual([GRP]);
        expect(merged.merged.groups[GRP].title).toBe("Job");
    });

    it("takes the account's title for a subgroup renamed elsewhere", () => {
        const local = profileOf({ subgroups: [subgroup(SUB, "Reading", GRP, ENV)] });
        const remote = profileOf({ subgroups: [subgroup(SUB, "To read", GRP, ENV)] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.subgroups)).toEqual([SUB]);
        expect(merged.merged.subgroups[SUB].title).toBe("To read");
    });

    it("takes the account's title and address for a link edited elsewhere", () => {
        const local = profileOf({ links: [link(LNK, "Salary", "https://old.test", GRP, ENV)] });
        const remote = profileOf({ links: [link(LNK, "Payroll", "https://new.test", GRP, ENV)] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.links)).toEqual([LNK]);
        expect(merged.merged.links[LNK].title).toBe("Payroll");
        expect(merged.merged.links[LNK].url).toBe("https://new.test");
    });

    it("follows a group moved to another workspace elsewhere", () => {
        // The scope a group pairs in is its workspace plus its title, so moving it between
        // workspaces defeated name pairing just as thoroughly as renaming it.
        const other = "0199aaaa-0000-7000-8000-00000000e002";
        const local = profileOf({
            environments: [environment(ENV, "Work"), environment(other, "Home")],
            groups: [group(GRP, "Reading", ENV)]
        });
        const remote = profileOf({
            environments: [environment(ENV, "Work"), environment(other, "Home")],
            groups: [group(GRP, "Reading", other)]
        });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.groups)).toEqual([GRP]);
        expect(merged.merged.groups[GRP].environmentId).toBe(other);
    });

    it("follows a link moved into a subgroup elsewhere", () => {
        const local = profileOf({ links: [link(LNK, "Docs", "https://d.test", GRP, ENV)] });
        const remote = profileOf({
            links: [link(LNK, "Docs", "https://d.test", GRP, ENV, { subGroupId: SUB })]
        });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.links)).toEqual([LNK]);
        expect(merged.merged.links[LNK].subGroupId).toBe(SUB);
    });

    it("keeps what this device made while it was signed out", () => {
        // The other half of the rule: identity settles the records both sides hold, and
        // everything else this device has is still carried across rather than dropped.
        const mine = "0199aaaa-0000-7000-8000-000000007002";
        const local = profileOf({
            groups: [group(GRP, "Work stuff", ENV)],
            links: [
                link(LNK, "Salary", "https://old.test", GRP, ENV),
                link(mine, "Added offline", "https://mine.test", GRP, ENV, { position: 1 })
            ]
        });
        const remote = profileOf({
            groups: [group(GRP, "Job", ENV)],
            links: [link(LNK, "Payroll", "https://new.test", GRP, ENV)]
        });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.links).sort()).toEqual([LNK, mine].sort());
        expect(merged.merged.links[mine].title).toBe("Added offline");
        expect(merged.merged.links[LNK].title).toBe("Payroll");
    });

    it("still pairs by name when the account has never seen the identifier", () => {
        // Two devices that have never met share no identifiers, and the name is all they can
        // agree on. That path is untouched.
        const local = profileOf({ environments: [environment("localId", "work")] });
        const remote = profileOf({ environments: [environment("remoteId", "Work")] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.environments)).toEqual(["remoteId"]);
        expect(merged.adoptedIds["localId"]).toBe("remoteId");
    });

    it("does not let a second local record claim a name identity already settled", () => {
        // The account renamed GRP to "Job"; this device separately has a group of its own
        // that happens to be called "Job". They are not the same group, and collapsing the
        // second into the first would lose it.
        const mine = "0199aaaa-0000-7000-8000-000000009002";
        const local = profileOf({
            groups: [group(GRP, "Work stuff", ENV, 0), group(mine, "Job", ENV, 1)]
        });
        const remote = profileOf({ groups: [group(GRP, "Job", ENV, 0)] });

        const merged = ProfileMergeEngine.merge(local, remote);

        expect(Object.keys(merged.merged.groups).sort()).toEqual([GRP, mine].sort());
        expect(merged.merged.groups[GRP].title).toBe("Job");
        expect(merged.merged.groups[mine].title).toBe("Job");
    });
});
