import { describe, expect, it } from "vitest";

import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import {
    WorkspaceWelcomeRepository, workspaceWelcomeRepository
} from "../../src/backend/repository/WorkspaceWelcomeRepository";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { welcomeActions, WorkspaceWelcomeViewModel } from "../../src/viewModel/workspaceWelcomeViewModel";
import { WorkspaceViewModel } from "../../src/viewModel/workspaceViewModel";
import { WorkspaceLessViewModel } from "../../src/viewModel/workspaceLessViewModel";

async function started(): Promise<AppStateRepository> {
    const profiles = new ProfileRepository();
    await profiles.init();
    const appState = new AppStateRepository();
    await appState.init(appStateInit, profiles.getActiveProfileId());
    return appState;
}

/** #182: the widget an empty workspace shows where its columns would be. */
describe("the empty workspace's widget", () => {

    it("shows on an empty workspace until cancelled - and stays cancelled on another page", async () => {
        const appState = await started();
        const welcomes = new WorkspaceWelcomeRepository();
        await welcomes.init();
        const viewModel = new WorkspaceWelcomeViewModel(appState, welcomes);
        await appState.addStarterWorkspace("My workspace");
        const id = appState.getCurrentEnvironmentId()!;

        expect(viewModel.isDue(id)).toBe(true);
        await viewModel.dismiss(id);
        expect(viewModel.isDue(id)).toBe(false);

        const laterPage = new WorkspaceWelcomeRepository();
        await laterPage.init();
        expect(new WorkspaceWelcomeViewModel(appState, laterPage).isDue(id)).toBe(false);
    });

    it("goes away once the workspace has a group", async () => {
        const appState = await started();
        const welcomes = new WorkspaceWelcomeRepository();
        await welcomes.init();
        await appState.addWorkspace("Work");
        const id = appState.getCurrentEnvironmentId()!;
        await appState.createGroup("Reading", id);

        expect(new WorkspaceWelcomeViewModel(appState, welcomes).isDue(id)).toBe(false);
    });

    it("offers a group, the bookmarks, signing in while signed out, and Cancel last", () => {
        expect(welcomeActions(false)).toEqual(["addGroup", "importBookmarks", "signIn", "cancel"]);
        expect(welcomeActions(true)).toEqual(["addGroup", "importBookmarks", "cancel"]);
    });
});

/** #182: deleting the last workspace leads to the page with no workspace, not to a new starter. */
describe("a profile the user emptied", () => {

    it("is remembered when its last workspace is deleted, and not when another one is", async () => {
        const appState = await started();
        await workspaceWelcomeRepository.init();
        await appState.addWorkspace("Work");
        await appState.addWorkspace("Home");
        const workspaces = new WorkspaceViewModel({ id: "", title: "" }, appState);
        const profileId = appState.getActiveProfileId();
        const [work, home] = Object.keys(appState.state$.get().environments);

        await workspaces.deleteWorkspace(work);
        expect(workspaceWelcomeRepository.wasEmptiedByUser(profileId)).toBe(false);

        await workspaces.deleteWorkspace(home);
        expect(workspaceWelcomeRepository.wasEmptiedByUser(profileId)).toBe(true);
    });

    it("stops counting as emptied once Cancel on that page has made the starter", async () => {
        const appState = await started();
        const welcomes = new WorkspaceWelcomeRepository();
        await welcomes.init();
        const profileId = appState.getActiveProfileId();
        await welcomes.markEmptiedByUser(profileId);

        expect(await new WorkspaceLessViewModel(appState, welcomes).makeStarter()).toBe(true);
        expect(welcomes.wasEmptiedByUser(profileId)).toBe(false);
        expect(Object.values(appState.state$.get().environments).map(one => one.name)).toEqual(["My space"]);
    });

    it("stops counting as emptied once a workspace is made from that page", async () => {
        const appState = await started();
        const welcomes = new WorkspaceWelcomeRepository();
        await welcomes.init();
        const profileId = appState.getActiveProfileId();
        await welcomes.markEmptiedByUser(profileId);

        expect(await new WorkspaceLessViewModel(appState, welcomes).createWorkspace("Work")).toBe(true);
        expect(welcomes.wasEmptiedByUser(profileId)).toBe(false);
    });
});
