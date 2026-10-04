import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { PREMIUM_PLAN_LIMITS } from "../../../src/backend/entity/PlanLimits";
import { LimitRefusal } from "../../../src/backend/entity/PlanLimits";
import { fairUseRefusals } from "../../../src/backend/repository/FairUseRefusals";
import { setStanding } from "../../support/standing";
import { planLimits$, premiumStanding$ } from "../../../src/backend/repository/PremiumStanding";
import {
    accountStandingRepository
} from "../../../src/backend/sync/AccountStandingRepository";
import { refusedAnotherProfile, refusedUnderFairUse } from "../../../src/viewModel/fairUseNoticeViewModel";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";

/**
 *  The free plan's caps, enforced in the same repositories as the fair use ones: two
 *  workspaces and one profile when not premium, the fair use numbers when premium, links
 *  capped only by fair use on either. Only growth is refused - a user who goes back to free
 *  keeps everything, editable, and can add again once back under.
 */
describe("free plan limits in the repositories", () => {

    let profiles: ProfileRepository;
    let appState: AppStateRepository;
    let refused: LimitRefusal[];
    let stopListening: () => void;

    beforeEach(async () => {
        setStanding(false);
        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("w1", "One", 0)],
            groups: [group("g1", "Group", "w1")],
            links: [],
            activeEnvironmentId: "w1"
        }));

        refused = [];
        stopListening = fairUseRefusals.refusals$.subscribe(notice => {
            if (notice) refused.push(notice);
        });
        refused.length = 0;
    });

    afterEach(() => {
        stopListening();
        setStanding(false);
    });

    const workspaceCount = () => appState.getWorkspaces().length;

    it("reads the standing the account standing repository publishes", () => {
        expect(accountStandingRepository.premium$).toBe(premiumStanding$);
        expect(accountStandingRepository.limits$).toBe(planLimits$);
    });

    describe("workspaces", () => {

        it("free: takes a second, refuses a third as a free plan limit", async () => {
            await appState.addWorkspace("Two");
            await appState.addWorkspace("Three");

            expect(workspaceCount()).toBe(2);
            expect(refused).toEqual([{ kind: "FREE_PLAN", limit: "WORKSPACES_PER_PROFILE", maximum: 2, sequence: expect.any(Number) }]);
        });

        it("premium: takes a third and more", async () => {
            setStanding(true);

            await appState.addWorkspace("Two");
            await appState.addWorkspace("Three");
            await appState.addWorkspace("Four");

            expect(workspaceCount()).toBe(4);
            expect(refused).toEqual([]);
        });

        it("downgrade: keeps every workspace editable, refuses only another, takes one once back under", async () => {
            setStanding(true);
            await appState.addWorkspace("Two");
            await appState.addWorkspace("Three");
            await appState.addWorkspace("Four");
            setStanding(false);

            await appState.addWorkspace("Five");
            expect(workspaceCount()).toBe(4);
            expect(refused.map(refusal => refusal.limit)).toEqual(["WORKSPACES_PER_PROFILE"]);

            const fourth = appState.getWorkspaces().find(workspace => workspace.name === "Four")!;
            await appState.renameWorkspace(fourth.id, "Renamed");
            expect(appState.getWorkspaces().map(workspace => workspace.name)).toContain("Renamed");
            await appState.createLink("https://example.com/kept", "Still growing", "g1");
            expect(Object.keys(appState.state$.get().links)).toHaveLength(1);

            for (const workspace of appState.getWorkspaces().slice(1)) {
                await appState.deleteWorksapce(workspace.id);
            }
            await appState.addWorkspace("Back under");
            expect(workspaceCount()).toBe(2);
        });
    });

    describe("profiles", () => {

        it("free: refuses a second profile as a free plan limit, created or imported", async () => {
            expect(profiles.getProfiles()).toHaveLength(1);

            expect(await profiles.createProfile("Second")).toBeNull();
            expect(refusedAnotherProfile(profiles.getProfiles().length)).toBe(true);

            expect(profiles.getProfiles()).toHaveLength(1);
            expect(refused.map(refusal => [refusal.kind, refusal.limit]))
                .toEqual([["FREE_PLAN", "PROFILES"], ["FREE_PLAN", "PROFILES"]]);
        });

        it("premium: takes a second profile", async () => {
            setStanding(true);

            expect(await profiles.createProfile("Second")).not.toBeNull();
            expect(refusedAnotherProfile(profiles.getProfiles().length)).toBe(false);
            expect(profiles.getProfiles()).toHaveLength(2);
        });

        it("downgrade: keeps every profile, refuses only another", async () => {
            setStanding(true);
            const second = await profiles.createProfile("Second");
            setStanding(false);

            expect(await profiles.createProfile("Third")).toBeNull();
            await profiles.renameProfile(second!.id, "Renamed");

            expect(profiles.getProfiles().map(profile => profile.name)).toEqual(
                expect.arrayContaining(["Renamed"]));
            expect(profiles.getProfiles()).toHaveLength(2);
        });
    });

    describe("links", () => {

        it("free: no cap of its own - a workspace fills to the fair use limit", async () => {
            await appState.replaceCurrentProfileData(profileOf({
                environments: [environment("w1", "One", 0)],
                groups: [group("g1", "Group", "w1")],
                links: Array.from({ length: PREMIUM_PLAN_LIMITS.linksPerWorkspace - 1 }, (_, index) =>
                    link(`l${index}`, `L${index}`, `https://example.com/${index}`, "g1", "w1", { position: index })),
                activeEnvironmentId: "w1"
            }));

            await appState.createLink("https://example.com/last", "Last", "g1");
            await appState.createLink("https://example.com/over", "Over", "g1");

            expect(Object.keys(appState.state$.get().links)).toHaveLength(PREMIUM_PLAN_LIMITS.linksPerWorkspace);
            expect(refused.map(refusal => refusal.limit)).toEqual(["LINKS_PER_WORKSPACE"]);
            expect(refused[0].kind).toBe("FAIR_USE");
        });
    });

    describe("imports", () => {

        const threeWorkspaces = profileOf({
            environments: [environment("a", "A", 0), environment("b", "B", 1), environment("c", "C", 2)]
        });

        it("free: refuses a file with more workspaces than the free plan allows", () => {
            expect(refusedUnderFairUse(threeWorkspaces)).toBe(true);
            expect(refused.map(refusal => refusal.limit)).toEqual(["WORKSPACES_PER_PROFILE"]);
            expect(refused[0].kind).toBe("FREE_PLAN");
        });

        it("premium: lets the same file through", () => {
            setStanding(true);
            expect(refusedUnderFairUse(threeWorkspaces)).toBe(false);
            expect(refused).toEqual([]);
        });
    });
});
