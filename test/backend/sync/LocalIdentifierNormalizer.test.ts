import { describe, expect, it } from "vitest";

import { isStorableIdentifier, LocalIdentifierNormalizer } from "../../../src/backend/sync/LocalIdentifierNormalizer";
import { environment, group, link, profileOf, subgroup } from "../../support/profileDataFixtures";

describe("isStorableIdentifier", () => {

    it("accepts a canonical UUID", () => {
        expect(isStorableIdentifier("0199aaaa-0000-7000-8000-00000000000a")).toBe(true);
    });

    it("rejects the identifiers this extension used to mint", () => {
        // The seeded profile and the example data: the reason this module exists at all.
        ["default", "env-1", "group-1", "subgroup-1", "link-1", ""]
            .forEach(identifier => expect(isStorableIdentifier(identifier)).toBe(false));
    });
});

describe("LocalIdentifierNormalizer.toStorableIdentifiers", () => {

    const seeded = () => profileOf({
        environments: [environment("env-1", "Default")],
        groups: [group("group-1", "Work", "env-1")],
        subgroups: [subgroup("subgroup-1", "Reading", "group-1", "env-1")],
        links: [link("link-1", "Docs", "https://docs.test", "group-1", "env-1",
            { subGroupId: "subgroup-1" })],
        activeEnvironmentId: "env-1"
    });

    it("gives every record an identifier the backend can store", () => {
        const { data } = LocalIdentifierNormalizer.toStorableIdentifiers(seeded());

        [
            ...Object.keys(data.environments),
            ...Object.keys(data.groups),
            ...Object.keys(data.subgroups),
            ...Object.keys(data.links)
        ].forEach(identifier => expect(isStorableIdentifier(identifier)).toBe(true));
    });

    it("repoints every reference at the identifier that replaced it", () => {
        const { data, replacements } = LocalIdentifierNormalizer.toStorableIdentifiers(seeded());

        const rewrittenLink = data.links[replacements["link-1"]];
        expect(rewrittenLink.groupId).toBe(replacements["group-1"]);
        expect(rewrittenLink.subGroupId).toBe(replacements["subgroup-1"]);
        expect(rewrittenLink.environmentId).toBe(replacements["env-1"]);
        expect(data.activeEnvironmentId).toBe(replacements["env-1"]);
    });

    it("leaves identifiers alone that were already storable", () => {
        const already = "0199aaaa-0000-7000-8000-00000000000a";
        const data = profileOf({ environments: [environment(already, "Default")] });

        const normalized = LocalIdentifierNormalizer.toStorableIdentifiers(data);

        expect(normalized.replacements).toEqual({});
        expect(Object.keys(normalized.data.environments)).toEqual([already]);
    });

    it("rewrites only what has to be rewritten in a half-migrated profile", () => {
        const already = "0199aaaa-0000-7000-8000-00000000000a";
        const data = profileOf({
            environments: [environment(already, "Default")],
            groups: [group("group-1", "Work", already)]
        });

        const normalized = LocalIdentifierNormalizer.toStorableIdentifiers(data);

        expect(Object.keys(normalized.replacements)).toEqual(["group-1"]);
        expect(normalized.data.groups[normalized.replacements["group-1"]].environmentId)
            .toBe(already);
    });
});

describe("LocalIdentifierNormalizer.toFreshIdentifiers", () => {

    it("shares no identifier with what it came from, so an import is a real copy", () => {
        const original = profileOf({
            environments: [environment("0199aaaa-0000-7000-8000-00000000000a", "Default")],
            groups: [group("0199bbbb-0000-7000-8000-00000000000b", "Work",
                "0199aaaa-0000-7000-8000-00000000000a")]
        });

        const { data } = LocalIdentifierNormalizer.toFreshIdentifiers(original);

        expect(Object.keys(data.environments)[0])
            .not.toBe("0199aaaa-0000-7000-8000-00000000000a");
        expect(Object.values(data.groups)[0].environmentId)
            .toBe(Object.keys(data.environments)[0]);
    });
});
