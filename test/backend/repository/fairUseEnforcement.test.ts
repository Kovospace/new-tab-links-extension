import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import { FAIR_USE_LIMITS, FairUseLimit } from "../../../src/backend/entity/FairUseLimits";
import { fairUseRefusals } from "../../../src/backend/repository/FairUseRefusals";
import { BookmarkViewModel } from "../../../src/viewModel/bookmarkViewModel";
import { refusedUnderFairUse } from "../../../src/viewModel/fairUseNoticeViewModel";
import { environment, group, link, profileOf, subgroup } from "../../support/profileDataFixtures";

const LINKS = FAIR_USE_LIMITS.LINKS_PER_WORKSPACE;

/** `count` links in one group (and optionally subgroup) of one workspace. */
function links(count: number, workspaceId: string, groupId: string, subGroupId?: string) {
    return Array.from({ length: count }, (_, index) =>
        link(`${groupId}-${subGroupId ?? "root"}-${index}`, `Link ${index}`,
            `https://example.com/${groupId}/${index}`, groupId, workspaceId,
            { position: index, subGroupId }));
}

/**
 *  Every path that puts something into the profile refuses once a fair use limit is reached,
 *  says which limit through the shared channel, and leaves everything already there alone.
 *
 *  "Full" is built as two workspaces: `full` holding exactly the links limit in group `g-full`,
 *  and `roomy` holding a group, a subgroup with one link, and one root link - the things that
 *  can be moved into `full`.
 */
describe("fair use limits in the repositories", () => {

    let profiles: ProfileRepository;
    let appState: AppStateRepository;
    let refused: FairUseLimit[];
    let stopListening: () => void;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();
        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        await appState.replaceCurrentProfileData(profileOf({
            environments: [environment("full", "Full", 0), environment("roomy", "Roomy", 1)],
            groups: [group("g-full", "Full group", "full"), group("g-roomy", "Roomy group", "roomy")],
            subgroups: [subgroup("s-roomy", "Roomy subgroup", "g-roomy", "roomy", 0)],
            links: [
                ...links(LINKS, "full", "g-full"),
                ...links(1, "roomy", "g-roomy", "s-roomy"),
                link("loose", "Loose", "https://example.com/loose", "g-roomy", "roomy", { position: 1 })
            ],
            activeEnvironmentId: "full"
        }));

        // The channel is a singleton, so the subscription has to end with the test or every
        // later test's refusals land in this one's list as well.
        refused = [];
        stopListening = fairUseRefusals.refusals$.subscribe(notice => {
            if (notice) refused.push(notice.limit);
        });
        refused.length = 0;
    });

    afterEach(() => stopListening());

    const linksIn = (workspaceId: string) => Object.values(appState.state$.get().links)
        .filter(candidate => candidate.environmentId === workspaceId).length;

    describe("links per workspace", () => {

        it("refuses a new link in a full workspace, and says so", async () => {
            await appState.createLink("https://example.com/new", "New", "g-full");

            expect(linksIn("full")).toBe(LINKS);
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("still takes a new link in a workspace with room", async () => {
            await appState.createLink("https://example.com/new", "New", "g-roomy");

            expect(linksIn("roomy")).toBe(3);
            expect(refused).toEqual([]);
        });

        it("refuses a dropped closed tab without moving an existing link of that address", async () => {
            // createLinkAt finds the link it made by address; refused, it would have found
            // and moved this older one instead.
            const existing = appState.state$.get().links["g-full-root-3"];

            await appState.createLinkAt(existing.url, "Again", "g-full", undefined, 0);

            expect(appState.state$.get().links["g-full-root-3"].position).toBe(existing.position);
            expect(linksIn("full")).toBe(LINKS);
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("refuses moving a link into a full workspace", async () => {
            await appState.moveLinkTo("loose", "g-full", undefined, 0);

            expect(appState.state$.get().links["loose"].environmentId).toBe("roomy");
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("refuses moving a subgroup, and the links it carries, into a full workspace", async () => {
            // A group in the full workspace to drop the subgroup into.
            await appState.createGroup("Target", "full");
            const target = Object.values(appState.state$.get().groups)
                .find(candidate => candidate.title === "Target")!;

            await appState.moveSubgroupTo("s-roomy", target.id, 0);

            expect(appState.state$.get().subgroups["s-roomy"].groupId).toBe("g-roomy");
            expect(linksIn("full")).toBe(LINKS);
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("refuses moving a group with links into a full workspace", async () => {
            await appState.moveGroupToWorkspace("g-roomy", "full");

            expect(appState.state$.get().groups["g-roomy"].environmentId).toBe("roomy");
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("lets links move around inside a full workspace, which adds nothing", async () => {
            await appState.moveLinkTo("g-full-root-0", "g-full", undefined, 10);

            expect(refused).toEqual([]);
        });

        it("never takes anything away from a workspace already over the limit", async () => {
            await appState.replaceCurrentProfileData(profileOf({
                environments: [environment("full", "Full")],
                groups: [group("g-full", "Full group", "full")],
                links: links(LINKS + 25, "full", "g-full"),
                activeEnvironmentId: "full"
            }));

            await appState.createLink("https://example.com/new", "New", "g-full");

            expect(linksIn("full")).toBe(LINKS + 25);
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("refuses a bookmark into a full workspace, answering the popup rather than publishing", async () => {
            const bookmarks = new BookmarkViewModel(appState);

            const refusal = await bookmarks.save("https://example.com/new", "New", "g-full");

            expect(refusal).toEqual({ limit: "LINKS_PER_WORKSPACE", maximum: LINKS });
            expect(linksIn("full")).toBe(LINKS);
            // The popup has nobody listening; the form says it in place.
            expect(refused).toEqual([]);
            expect(await bookmarks.save("https://example.com/new", "New", "g-roomy")).toBeNull();
        });
    });

    describe("workspaces", () => {

        it("refuses a workspace past the limit and keeps every existing one", async () => {
            for (let index = 2; index < FAIR_USE_LIMITS.WORKSPACES; index++) {
                await appState.addWorkspace(`Workspace ${index}`);
            }
            expect(appState.getWorkspaces()).toHaveLength(FAIR_USE_LIMITS.WORKSPACES);
            expect(refused).toEqual([]);

            await appState.addWorkspace("One too many");

            expect(appState.getWorkspaces()).toHaveLength(FAIR_USE_LIMITS.WORKSPACES);
            expect(refused).toEqual(["WORKSPACES"]);
        });
    });

    describe("profiles", () => {

        it("refuses a profile past the limit, whether created or imported", async () => {
            while (profiles.getProfiles().length < FAIR_USE_LIMITS.PROFILES) {
                expect(await profiles.createProfile(`Profile ${profiles.getProfiles().length}`))
                    .not.toBeNull();
            }

            expect(await profiles.createProfile("One too many")).toBeNull();
            expect(profiles.getProfiles()).toHaveLength(FAIR_USE_LIMITS.PROFILES);
            expect(refused).toEqual(["PROFILES"]);
        });
    });

    describe("imports", () => {

        it("refuses a file over a limit whole, rather than cutting it down", () => {
            const tooBig = profileOf({
                environments: [environment("w", "W")],
                groups: [group("g", "G", "w")],
                links: links(LINKS + 1, "w", "g")
            });

            expect(refusedUnderFairUse(tooBig)).toBe(true);
            expect(refused).toEqual(["LINKS_PER_WORKSPACE"]);
        });

        it("lets a file inside the limits through", () => {
            expect(refusedUnderFairUse(profileOf({
                environments: [environment("w", "W")],
                groups: [group("g", "G", "w")],
                links: links(LINKS, "w", "g")
            }))).toBe(false);
            expect(refused).toEqual([]);
        });
    });
});
