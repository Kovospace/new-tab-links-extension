import { describe, expect, it } from "vitest";

import {
    capExceededBy, FREE_PLAN_LIMITS, isLimitName, limitViolationIn, linksInWorkspace, planLimitsFrom,
    PREMIUM_PLAN_LIMITS, refusalKindOf, refusalOfAnotherProfile, refusalOfAnotherWorkspace,
    refusalOfMoreGroups, refusalOfMoreLinks, refusalOfMoreSubgroups
} from "../../../src/backend/entity/PlanLimits";
import { environment, group, link, profileOf, subgroup } from "../../support/profileDataFixtures";

/** `count` links in one group of one workspace. */
function links(count: number, workspaceId: string, groupId: string) {
    return Array.from({ length: count }, (_, index) =>
        link(`${workspaceId}-link-${index}`, `Link ${index}`, `https://example.com/${index}`,
            groupId, workspaceId, { position: index }));
}

function workspaces(count: number) {
    return Array.from({ length: count }, (_, index) => environment(`env-${index}`, `Workspace ${index}`, index));
}

function groups(count: number, workspaceId: string) {
    return Array.from({ length: count }, (_, index) => group(`${workspaceId}-g-${index}`, `G ${index}`, workspaceId, index));
}

/**
 *  The numbers are what the website publishes - the price table and the Fair Use Policy - and
 *  the names are the backend's `limit` values. Both are pinned: a number changed here without
 *  the website changing is a promise broken, and a name that drifts from the backend's is a
 *  refusal this side cannot read.
 */
describe("the compiled limits", () => {

    it("are the published table", () => {
        expect(FREE_PLAN_LIMITS).toEqual({
            profiles: 1, workspacesPerProfile: 2, groupsPerWorkspace: 25, subgroupsPerGroup: 25,
            linksPerWorkspace: 500, closedTabs: 25, devices: 5
        });
        expect(PREMIUM_PLAN_LIMITS).toEqual({
            profiles: 50, workspacesPerProfile: 50, groupsPerWorkspace: 25, subgroupsPerGroup: 25,
            linksPerWorkspace: 500, closedTabs: 500, devices: 100
        });
    });

    it("know the backend's limit names and nothing else", () => {
        expect(isLimitName("WORKSPACES_PER_PROFILE")).toBe(true);
        expect(isLimitName("GROUPS_PER_WORKSPACE")).toBe(true);
        expect(isLimitName("WORKSPACES")).toBe(false);
        expect(isLimitName("toString")).toBe(false);
        expect(isLimitName(undefined)).toBe(false);
    });
});

describe("planLimitsFrom, which reads the account's limits", () => {

    it("takes the account's numbers, so a limit changed on the server needs no release", () => {
        expect(planLimitsFrom({ workspacesPerProfile: 3, linksPerWorkspace: 800 }, false))
            .toEqual({ ...FREE_PLAN_LIMITS, workspacesPerProfile: 3, linksPerWorkspace: 800 });
    });

    it("keeps the default for anything missing or nonsensical", () => {
        expect(planLimitsFrom(undefined, true)).toEqual(PREMIUM_PLAN_LIMITS);
        expect(planLimitsFrom({ profiles: -1, devices: "many" }, true)).toEqual(PREMIUM_PLAN_LIMITS);
    });
});

describe("whose limit a refusal is", () => {

    it("is the free plan's for what premium raises, when not premium", () => {
        expect(refusalKindOf("PROFILES", false)).toBe("FREE_PLAN");
        expect(refusalKindOf("WORKSPACES_PER_PROFILE", false)).toBe("FREE_PLAN");
        expect(refusalKindOf("DEVICES", false)).toBe("FREE_PLAN");
    });

    it("is fair use for the caps every plan shares, and for everything when premium", () => {
        expect(refusalKindOf("GROUPS_PER_WORKSPACE", false)).toBe("FAIR_USE");
        expect(refusalKindOf("LINKS_PER_WORKSPACE", false)).toBe("FAIR_USE");
        expect(refusalKindOf("PROFILES", true)).toBe("FAIR_USE");
    });
});

describe("growth checks, which refuse only growth", () => {

    it("count workspaces per profile", () => {
        expect(refusalOfAnotherWorkspace(profileOf({ environments: workspaces(1) }), FREE_PLAN_LIMITS, false)).toBeNull();
        expect(refusalOfAnotherWorkspace(profileOf({ environments: workspaces(2) }), FREE_PLAN_LIMITS, false))
            .toEqual({ kind: "FREE_PLAN", limit: "WORKSPACES_PER_PROFILE", maximum: 2 });
        expect(refusalOfAnotherWorkspace(profileOf({ environments: workspaces(2) }), PREMIUM_PLAN_LIMITS, true)).toBeNull();
    });

    it("count profiles", () => {
        expect(refusalOfAnotherProfile(0, FREE_PLAN_LIMITS, false)).toBeNull();
        expect(refusalOfAnotherProfile(1, FREE_PLAN_LIMITS, false)?.limit).toBe("PROFILES");
        expect(refusalOfAnotherProfile(50, PREMIUM_PLAN_LIMITS, true))
            .toEqual({ kind: "FAIR_USE", limit: "PROFILES", maximum: 50 });
    });

    it("stop groups at the cap of their workspace only", () => {
        const data = profileOf({ environments: workspaces(2), groups: groups(25, "env-0") });
        expect(refusalOfMoreGroups(data, "env-0", 1, FREE_PLAN_LIMITS, false)?.limit).toBe("GROUPS_PER_WORKSPACE");
        expect(refusalOfMoreGroups(data, "env-1", 1, FREE_PLAN_LIMITS, false)).toBeNull();
    });

    it("stop subgroups at the cap of their group only", () => {
        const data = profileOf({
            environments: workspaces(1), groups: groups(2, "env-0"),
            subgroups: Array.from({ length: 25 }, (_, index) =>
                subgroup(`s-${index}`, `S ${index}`, "env-0-g-0", "env-0", index))
        });
        expect(refusalOfMoreSubgroups(data, "env-0-g-0", 1, FREE_PLAN_LIMITS, false)?.limit).toBe("SUBGROUPS_PER_GROUP");
        expect(refusalOfMoreSubgroups(data, "env-0-g-1", 1, FREE_PLAN_LIMITS, false)).toBeNull();
    });

    it("stop links at the cap of their workspace only", () => {
        const full = profileOf({ links: links(500, "env-a", "g-a") });
        expect(linksInWorkspace(full, "env-a")).toBe(500);
        expect(refusalOfMoreLinks(full, "env-a", 1, FREE_PLAN_LIMITS, false)?.limit).toBe("LINKS_PER_WORKSPACE");
        expect(refusalOfMoreLinks(full, "env-b", 1, FREE_PLAN_LIMITS, false)).toBeNull();
        expect(refusalOfMoreLinks(full, "env-a", 0, FREE_PLAN_LIMITS, false)).toBeNull();
    });
});

describe("capExceededBy, which keeps a workspace over a cap from synchronising", () => {

    it("names the cap a workspace is over, and nothing for one exactly at it", () => {
        const atCap = profileOf({ environments: workspaces(1), groups: groups(25, "env-0") });
        const over = profileOf({ environments: workspaces(1), groups: groups(26, "env-0") });
        expect(capExceededBy(atCap, "env-0", FREE_PLAN_LIMITS)).toBeNull();
        expect(capExceededBy(over, "env-0", FREE_PLAN_LIMITS)).toBe("GROUPS_PER_WORKSPACE");
    });
});

describe("limitViolationIn, which judges an import whole", () => {

    it("refuses a third workspace on the free plan but not on premium", () => {
        const three = profileOf({ environments: workspaces(3) });
        expect(limitViolationIn(three, FREE_PLAN_LIMITS, false)?.limit).toBe("WORKSPACES_PER_PROFILE");
        expect(limitViolationIn(three, PREMIUM_PLAN_LIMITS, true)).toBeNull();
    });

    it("refuses a workspace over the links cap on every plan", () => {
        const full = profileOf({ environments: [environment("env-a", "A")], links: links(501, "env-a", "g-a") });
        expect(limitViolationIn(full, PREMIUM_PLAN_LIMITS, true)?.limit).toBe("LINKS_PER_WORKSPACE");
    });
});
