import { describe, expect, it } from "vitest";

import { buildExampleProfileData, appStateInit } from "../../../src/backend/datasource/init/AppStateInit";
import {
    exampleFingerprintOf, isExampleWorkspace, markedAsExample, withExampleFlagsSettled, withoutExampleWorkspaces
} from "../../../src/backend/entity/ExampleData";
import { AppStateRepository } from "../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../src/backend/repository/ProfileRepository";
import { environment, profileOf } from "../../support/profileDataFixtures";

describe("example data", () => {

    it("fingerprints content, not identifiers, so two loads of the template look alike", () => {
        const one = buildExampleProfileData();
        const other = buildExampleProfileData();
        expect(exampleFingerprintOf(one, Object.keys(one.environments)[0]))
            .toBe(exampleFingerprintOf(other, Object.keys(other.environments)[0]));
    });

    it("keeps the flag while untouched and clears it for good on the first change", () => {
        const loaded = markedAsExample(buildExampleProfileData());
        const workspaceId = Object.keys(loaded.environments)[0];
        expect(withExampleFlagsSettled(loaded)).toBe(loaded);

        const groupId = Object.keys(loaded.groups)[0];
        const edited = withExampleFlagsSettled({
            ...loaded, groups: { ...loaded.groups, [groupId]: { ...loaded.groups[groupId], title: "Mine" } }
        });
        expect(isExampleWorkspace(edited.environments[workspaceId])).toBe(false);

        // Changing it back does not make it an example again.
        const reverted = withExampleFlagsSettled({ ...edited, groups: loaded.groups });
        expect(isExampleWorkspace(reverted.environments[workspaceId])).toBe(false);
    });

    it("is cleared by an edit made through the repository", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());
        await appState.replaceCurrentProfileData(markedAsExample(buildExampleProfileData()));
        const workspaceId = appState.getWorkspaces()[0].id;
        expect(isExampleWorkspace(appState.getWorkspaces()[0])).toBe(true);

        await appState.renameWorkspace(workspaceId, "Mine", undefined);

        expect(isExampleWorkspace(appState.getWorkspaces()[0])).toBe(false);
    });

    it("is removed whole - workspace and everything under it - leaving the user's own", () => {
        const loaded = markedAsExample(buildExampleProfileData());
        const own = environment("own", "Own");
        const { data, removed } = withoutExampleWorkspaces({
            ...loaded, environments: { ...loaded.environments, own }
        });
        expect(removed).toBe(1);
        expect(Object.keys(data.environments)).toEqual(["own"]);
        expect(data.links).toEqual({});
        expect(data.activeEnvironmentId).toBe("own");
        expect(withoutExampleWorkspaces(profileOf({ environments: [own] })).removed).toBe(0);
    });
});
