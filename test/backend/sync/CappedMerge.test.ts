import { describe, expect, it } from "vitest";

import { FREE_PLAN_LIMITS } from "../../../src/backend/entity/PlanLimits";
import { mergeWithinCaps } from "../../../src/backend/sync/CappedMerge";
import { environment, group, profileOf } from "../../support/profileDataFixtures";

function groups(count: number, workspaceId: string, prefix: string) {
    return Array.from({ length: count }, (_, index) => group(`${prefix}-${index}`, `${prefix} ${index}`, workspaceId, index));
}

describe("mergeWithinCaps", () => {

    it("joins a workspace by name when the result stays within the caps", () => {
        const result = mergeWithinCaps(
            profileOf({ environments: [environment("local", "Work")], groups: groups(3, "local", "mine") }),
            profileOf({ environments: [environment("remote", "Work")], groups: groups(3, "remote", "theirs") }),
            FREE_PLAN_LIMITS);

        expect(result.heldApart).toEqual([]);
        expect(Object.keys(result.merged.environments)).toEqual(["remote"]);
        expect(Object.values(result.merged.groups).every(record => record.environmentId === "remote")).toBe(true);
    });

    it("keeps a workspace apart, untouched, when joining it would go over a cap", () => {
        const result = mergeWithinCaps(
            profileOf({ environments: [environment("local", "Work")], groups: groups(10, "local", "mine") }),
            profileOf({ environments: [environment("remote", "Work")], groups: groups(20, "remote", "theirs") }),
            FREE_PLAN_LIMITS);

        expect(result.heldApart).toEqual([{ id: "local", name: "Work" }]);
        expect(Object.keys(result.merged.environments).sort()).toEqual(["local", "remote"]);
        expect(Object.values(result.merged.groups).filter(record => record.environmentId === "local")).toHaveLength(10);
        expect(Object.values(result.merged.groups).filter(record => record.environmentId === "remote")).toHaveLength(20);
    });
});
