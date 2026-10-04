import { describe, expect, it } from "vitest";

import { FAIR_USE_LIMITS } from "../../../src/backend/entity/FairUseLimits";
import {
    FREE_PLAN_LIMITS, freePlanRefusalOf, isFreePlanLimit, isFreePlanRefusal, limitViolationIn,
    refusalOfAnotherProfile, refusalOfAnotherWorkspace
} from "../../../src/backend/entity/FreePlanLimits";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";

const workspaces = (count: number) =>
    Array.from({ length: count }, (_, index) => environment(`w${index}`, `W${index}`, index));

/**
 *  The free plan's numbers are what the website advertises, and the names are the backend's
 *  `limit` values. Which cap binds is the plan's: the free one when not premium, the fair use
 *  one when premium - and the fair use one is asked first, so a premium user is never offered
 *  an upgrade they already have.
 */
describe("FREE_PLAN_LIMITS", () => {

    it("are the advertised free plan, named as the backend names them", () => {
        expect(FREE_PLAN_LIMITS).toEqual({ WORKSPACES: 2, PROFILES: 1, DEVICES: 5 });
        expect(isFreePlanLimit("DEVICES")).toBe(true);
        expect(isFreePlanLimit("LINKS_PER_WORKSPACE")).toBe(false);
    });
});

describe("the workspace cap, free vs premium", () => {

    it("lets a free user have two and refuses the third as a free plan limit", () => {
        expect(refusalOfAnotherWorkspace(profileOf({ environments: workspaces(1) }), false)).toBeNull();
        const refusal = refusalOfAnotherWorkspace(profileOf({ environments: workspaces(2) }), false);
        expect(refusal).toEqual(freePlanRefusalOf("WORKSPACES"));
        expect(isFreePlanRefusal(refusal!)).toBe(true);
    });

    it("lets premium go on to the fair use limit, refused there as fair use", () => {
        expect(refusalOfAnotherWorkspace(profileOf({ environments: workspaces(2) }), true)).toBeNull();
        const refusal = refusalOfAnotherWorkspace(
            profileOf({ environments: workspaces(FAIR_USE_LIMITS.WORKSPACES) }), true);
        expect(refusal).toEqual({ limit: "WORKSPACES", maximum: FAIR_USE_LIMITS.WORKSPACES });
        expect(isFreePlanRefusal(refusal!)).toBe(false);
    });
});

describe("the profile cap, free vs premium", () => {

    it("lets a free user have one profile and refuses a second", () => {
        expect(refusalOfAnotherProfile(0, false)).toBeNull();
        expect(refusalOfAnotherProfile(1, false)).toEqual(freePlanRefusalOf("PROFILES"));
    });

    it("lets premium go on to the fair use limit", () => {
        expect(refusalOfAnotherProfile(1, true)).toBeNull();
        expect(refusalOfAnotherProfile(FAIR_USE_LIMITS.PROFILES, true))
            .toEqual({ limit: "PROFILES", maximum: FAIR_USE_LIMITS.PROFILES });
    });
});

describe("limitViolationIn, which judges an import under the current plan", () => {

    const threeWorkspaces = profileOf({ environments: workspaces(3) });

    it("refuses a file with more workspaces than the free plan allows, when not premium", () => {
        expect(limitViolationIn(threeWorkspaces, false)).toEqual(freePlanRefusalOf("WORKSPACES"));
    });

    it("lets the same file through for premium", () => {
        expect(limitViolationIn(threeWorkspaces, true)).toBeNull();
    });

    it("has no free plan limit on links: the fair use one binds on every plan", () => {
        const full = profileOf({
            environments: workspaces(1),
            groups: [group("g", "G", "w0")],
            links: Array.from({ length: FAIR_USE_LIMITS.LINKS_PER_WORKSPACE + 1 }, (_, index) =>
                link(`l${index}`, `L${index}`, `https://example.com/${index}`, "g", "w0", { position: index }))
        });
        expect(limitViolationIn(full, false)).toEqual({
            limit: "LINKS_PER_WORKSPACE", maximum: FAIR_USE_LIMITS.LINKS_PER_WORKSPACE
        });
        expect(limitViolationIn(full, true)).toEqual(limitViolationIn(full, false));
    });
});
