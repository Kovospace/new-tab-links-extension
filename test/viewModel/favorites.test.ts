import { describe, expect, it } from "vitest";

import { favoritesOfWorkspace, isAddressFavorite, linkWithAddress, setAddressFavorite } from "../../src/viewModel/favorites";
import { environment, group, link, profileOf, subgroup } from "../support/profileDataFixtures";
import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";

const favorite = (id: string, title: string, groupId: string, extras: { subGroupId?: string; position?: number } = {}) =>
    ({ ...link(id, title, `https://${id}.test`, groupId, "work", extras), favorite: true });

/** #183: the open workspace's favorites, as the side panel and the popup list them. */
describe("favoritesOfWorkspace", () => {

    const data = profileOf({
        environments: [environment("work", "Work"), environment("home", "Home")],
        groups: [group("second", "Second", "work", 1), group("first", "First", "work", 0), group("away", "Away", "home")],
        subgroups: [subgroup("tools", "Tools", "first", "work", 1)],
        links: [
            favorite("late", "Late", "first", { position: 2 }),
            favorite("inTools", "In tools", "first", { subGroupId: "tools", position: 0 }),
            favorite("early", "Early", "first", { position: 0 }),
            link("plain", "Plain", "https://plain.test", "first", "work", { position: 3 }),
            favorite("other", "Other group", "second", { position: 0 }),
            { ...link("elsewhere", "Elsewhere", "https://elsewhere.test", "away", "home"), favorite: true }
        ]
    });

    it("lists them as the page draws them: group by group, a subgroup's in its place", () => {
        expect(favoritesOfWorkspace(data, "work").map(one => one.id))
            .toEqual(["early", "inTools", "late", "other"]);
    });

    it("says where each is kept, and leaves out other workspaces and links that are not favorites", () => {
        const listed = favoritesOfWorkspace(data, "work");
        expect(listed.find(one => one.id === "inTools")?.place).toBe("First › Tools");
        expect(listed.map(one => one.id)).not.toContain("plain");
        expect(listed.map(one => one.id)).not.toContain("elsewhere");
    });

    it("finds the workspace's link under an address, a trailing slash aside", () => {
        expect(linkWithAddress(data, "work", "https://early.test/")?.id).toBe("early");
        expect(linkWithAddress(data, "work", "https://elsewhere.test")).toBeNull();
    });
});

/** #183: a closed tab, a visit or a suggestion is marked through the link the workspace keeps. */
describe("setAddressFavorite", () => {

    it("marks the open workspace's link under the address, and says when there is none", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.addWorkspace("Work");
        const workspaceId = appState.getCurrentEnvironmentId()!;
        await appState.createGroup("Reading", workspaceId);
        const groupId = appState.getGroups(workspaceId)[0].id;
        await appState.createLink("https://news.test/", "News", groupId);

        expect(await setAddressFavorite("https://news.test", true, appState)).toBe(true);
        await profiles.updateSettings({ enableFavorites: true });
        expect(isAddressFavorite("https://news.test/", appState, profiles)).toBe(true);
        expect(await setAddressFavorite("https://unknown.test", true, appState)).toBe(false);

        await setAddressFavorite("https://news.test", false, appState);
        expect(Object.values(appState.state$.get().links)[0].favorite).toBeUndefined();
    });

    it("makes a link a favorite at birth from the add-link dialog", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.addWorkspace("Work");
        const workspaceId = appState.getCurrentEnvironmentId()!;
        await appState.createGroup("Reading", workspaceId);
        await appState.createLink("https://news.test", "News", appState.getGroups(workspaceId)[0].id, undefined, true);

        expect(Object.values(appState.state$.get().links)[0].favorite).toBe(true);
    });
});
