import { describe, expect, it } from "vitest";

import {
    canAddLinksToWorkspace, canAddProfile, canAddWorkspace, FAIR_USE_LIMITS, fairUseViolationIn,
    isFairUseLimit, linksInWorkspace
} from "../../../src/backend/entity/FairUseLimits";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";

/** `count` links in one group of one workspace. */
function links(count: number, workspaceId: string, groupId: string) {
    return Array.from({ length: count }, (_, index) =>
        link(`${workspaceId}-link-${index}`, `Link ${index}`, `https://example.com/${index}`,
            groupId, workspaceId, { position: index }));
}

/**
 *  The numbers are the website's Fair Use Policy, and the names are the backend's `limit`
 *  values. Both are pinned: a number changed here without the policy changing is a promise
 *  broken, and a name that drifts from the backend's is a refusal this side cannot read.
 */
describe("FAIR_USE_LIMITS", () => {

    it("are the published policy, named as the backend names them", () => {
        expect(FAIR_USE_LIMITS).toEqual({
            LINKS_PER_WORKSPACE: 500,
            WORKSPACES: 50,
            PROFILES: 50,
            CLOSED_TAB_HISTORY: 500
        });
    });

    it("recognises only the limits it knows", () => {
        expect(isFairUseLimit("WORKSPACES")).toBe(true);
        expect(isFairUseLimit("DEVICES")).toBe(false);
        expect(isFairUseLimit(undefined)).toBe(false);
        expect(isFairUseLimit("toString")).toBe(false);
    });
});

describe("the growth checks", () => {

    it("counts links per workspace, not per profile", () => {
        const data = profileOf({
            links: [...links(3, "env-a", "g-a"), ...links(2, "env-b", "g-b")]
        });

        expect(linksInWorkspace(data, "env-a")).toBe(3);
        expect(linksInWorkspace(data, "env-b")).toBe(2);
    });

    it("lets a workspace fill up to the limit and no further", () => {
        const almost = profileOf({ links: links(FAIR_USE_LIMITS.LINKS_PER_WORKSPACE - 1, "env-a", "g-a") });
        const full = profileOf({ links: links(FAIR_USE_LIMITS.LINKS_PER_WORKSPACE, "env-a", "g-a") });

        expect(canAddLinksToWorkspace(almost, "env-a")).toBe(true);
        expect(canAddLinksToWorkspace(almost, "env-a", 2)).toBe(false);
        expect(canAddLinksToWorkspace(full, "env-a")).toBe(false);
        // Another workspace of the same profile is not affected.
        expect(canAddLinksToWorkspace(full, "env-b")).toBe(true);
    });

    it("stops workspaces and profiles at their limits", () => {
        const environments = (count: number) => Array.from({ length: count }, (_, index) =>
            environment(`env-${index}`, `Workspace ${index}`, index));

        expect(canAddWorkspace(profileOf({ environments: environments(49) }))).toBe(true);
        expect(canAddWorkspace(profileOf({ environments: environments(50) }))).toBe(false);
        expect(canAddProfile(49)).toBe(true);
        expect(canAddProfile(50)).toBe(false);
    });
});

describe("fairUseViolationIn, which judges an import", () => {

    it("passes a profile inside every limit", () => {
        expect(fairUseViolationIn(profileOf({
            environments: [environment("env-a", "A")],
            groups: [group("g-a", "G", "env-a")],
            links: links(FAIR_USE_LIMITS.LINKS_PER_WORKSPACE, "env-a", "g-a")
        }))).toBeNull();
    });

    it("names a workspace over the links limit", () => {
        expect(fairUseViolationIn(profileOf({
            environments: [environment("env-a", "A")],
            links: links(FAIR_USE_LIMITS.LINKS_PER_WORKSPACE + 1, "env-a", "g-a")
        }))).toEqual({ limit: "LINKS_PER_WORKSPACE", maximum: 500 });
    });

    it("names too many workspaces", () => {
        expect(fairUseViolationIn(profileOf({
            environments: Array.from({ length: 51 }, (_, index) => environment(`env-${index}`, "W"))
        }))).toEqual({ limit: "WORKSPACES", maximum: 50 });
    });
});
