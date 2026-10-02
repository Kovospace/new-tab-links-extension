import { describe, expect, it } from "vitest";
import { appStateInit, buildExampleProfileData } from "../../../../src/backend/datasource/init/AppStateInit";
import { AppStateRepository } from "../../../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../../../src/backend/repository/ProfileRepository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 *  What a new user meets. The seed used to be a developer's test data - five "test link"
 *  entries at a placeholder address - and because it held a workspace, a fresh install
 *  skipped the first-run screen and showed that to everyone.
 */
describe("a fresh install", () => {

    it("starts with no workspace, so the first-run screen is what is shown", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        expect(appState.getCurrentEnvironment()).toBeNull();
        expect(Object.keys(appState.state$.get().links)).toEqual([]);
    });
});

describe("the example set", () => {

    it("is a workspace with groups, a subgroup and links, and makes it the open one", () => {
        const data = buildExampleProfileData();

        expect(Object.keys(data.environments)).toHaveLength(1);
        expect(data.activeEnvironmentId).toBe(Object.keys(data.environments)[0]);
        expect(Object.keys(data.groups).length).toBeGreaterThanOrEqual(2);
        expect(Object.keys(data.subgroups)).toHaveLength(1);
        expect(Object.values(data.links).some(link => link.subGroupId)).toBe(true);
    });

    it("links only to real https sites", () => {
        for (const link of Object.values(buildExampleProfileData().links)) {
            expect(new URL(link.url).protocol).toBe("https:");
        }
    });

    it("keys every record by a UUID, minted anew each time it is loaded", () => {
        const first = buildExampleProfileData();
        const second = buildExampleProfileData();
        const idsOf = (data: typeof first) => [
            ...Object.keys(data.environments), ...Object.keys(data.groups),
            ...Object.keys(data.subgroups), ...Object.keys(data.links)
        ];

        for (const id of idsOf(first)) {
            expect(id).toMatch(UUID);
        }
        expect(idsOf(first).filter(id => idsOf(second).includes(id))).toEqual([]);
    });

    it("puts the subgroup after the group's root-level links in their shared sequence", () => {
        const data = buildExampleProfileData();
        const subgroup = Object.values(data.subgroups)[0];
        const rootPositions = Object.values(data.links)
            .filter(link => link.groupId === subgroup.groupId && !link.subGroupId)
            .map(link => link.position);

        expect(rootPositions).not.toContain(subgroup.position);
        expect(Math.max(...rootPositions)).toBeLessThan(subgroup.position);
    });
});
