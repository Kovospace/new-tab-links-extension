import { describe, expect, it } from "vitest";

import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { WorkspaceWelcomeRepository } from "../../src/backend/repository/WorkspaceWelcomeRepository";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { welcomeActions, WorkspaceWelcomeViewModel } from "../../src/viewModel/workspaceWelcomeViewModel";

/** #182: the dialog an empty workspace opens with, once per workspace on each browser. */
describe("the workspace welcome", () => {

    async function started(): Promise<{ appState: AppStateRepository; viewModel: WorkspaceWelcomeViewModel }> {
        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        const welcomes = new WorkspaceWelcomeRepository();
        await welcomes.init();
        return { appState, viewModel: new WorkspaceWelcomeViewModel(appState, welcomes) };
    }

    it("is due for an empty workspace, once - another page of this browser does not offer it again", async () => {
        const { appState, viewModel } = await started();
        await appState.addStarterWorkspace("My workspace");
        const id = appState.getCurrentEnvironmentId()!;

        expect(viewModel.isDue(id)).toBe(true);
        await viewModel.markOffered(id);
        expect(viewModel.isDue(id)).toBe(false);

        const laterPage = new WorkspaceWelcomeRepository();
        await laterPage.init();
        expect(new WorkspaceWelcomeViewModel(appState, laterPage).isDue(id)).toBe(false);
    });

    it("is not due for a workspace that already has a group", async () => {
        const { appState, viewModel } = await started();
        await appState.addWorkspace("Work");
        const id = appState.getCurrentEnvironmentId()!;
        await appState.createGroup("Reading", id);

        expect(viewModel.isDue(id)).toBe(false);
    });

    it("welcomes the starter as the first workspace and offers the examples there", async () => {
        const { appState, viewModel } = await started();
        await appState.addStarterWorkspace("My workspace");

        const welcome = viewModel.welcomeFor(appState.getCurrentEnvironmentId()!, { signedIn: false });
        expect(welcome.title).toBe("Welcome to Tabilinks");
        expect(welcome.actions).toEqual(
            ["addGroup", "importBookmarks", "rename", "loadExamples", "logIn", "syncCode", "cancel"]);
    });

    it("offers signing in only to somebody signed out, the examples only on the starter", () => {
        expect(welcomeActions({ hasGroups: false, starter: false, signedIn: true }))
            .toEqual(["addGroup", "importBookmarks", "rename", "cancel"]);
        expect(welcomeActions({ hasGroups: false, starter: false, signedIn: false, renamed: true }))
            .toEqual(["addGroup", "importBookmarks", "logIn", "syncCode", "cancel"]);
    });
});
