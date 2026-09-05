import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileRepository } from "../backend/repository/ProfileRepository";
import { appStateInit } from "../backend/datasource/init/AppStateInit";
import { ProfileManagerViewModel } from "./profileManagerViewModel";
import { emptyProfile, environment, link, profileOf } from "../test/profileDataFixtures";

const OTHER = "0199bbbb-0000-7000-8000-00000000000b";
const THIRD = "0199cccc-0000-7000-8000-00000000000c";

describe("ProfileManagerViewModel", () => {

    let profiles: ProfileRepository;
    let appState: AppStateRepository;
    let manager: ProfileManagerViewModel;

    /** Adds a profile to the registry with data of its own, the way an account pull would. */
    async function addProfile(id: string, name: string, links: number): Promise<void> {
        await profiles.upsertProfile({ id, name, createdAt: 0 });
        await appState.saveProfileData(id, links === 0 ? emptyProfile() : profileOf({
            environments: [environment("env", "Default")],
            links: Array.from({ length: links }, (_, index) =>
                link(`link-${index}`, `Link ${index}`, `https://${index}.test`, "grp", "env"))
        }));
    }

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();

        appState = new AppStateRepository();
        await appState.init(appStateInit, profiles.getActiveProfileId());

        manager = new ProfileManagerViewModel(profiles, appState);
    });

    it("lists every profile, marking the one being displayed", async () => {
        await addProfile(OTHER, "Spare", 0);

        await manager.refresh();

        const rows = manager.observables.profiles.get();
        expect(rows).toHaveLength(2);
        expect(rows.find(row => row.id === "default")?.active).toBe(true);
        expect(rows.find(row => row.id === OTHER)?.active).toBe(false);
    });

    it("says what each profile holds, which is how a stray one is spotted", async () => {
        // The whole reason the counts are there: an account that collected stray profiles has
        // several of one name, and only one of them holds anything.
        await addProfile(OTHER, "Default", 0);
        await addProfile(THIRD, "Default", 3);

        await manager.refresh();

        const rows = manager.observables.profiles.get();
        expect(rows.find(row => row.id === OTHER)?.empty).toBe(true);
        expect(rows.find(row => row.id === OTHER)?.contentsLabel).toBe("empty");
        expect(rows.find(row => row.id === THIRD)?.empty).toBe(false);
        expect(rows.find(row => row.id === THIRD)?.contentsLabel).toBe("1 workspace, 3 links");
    });

    it("deletes a profile and forgets what it held", async () => {
        await addProfile(OTHER, "Spare", 2);
        await manager.refresh();

        expect(await manager.deleteProfile(OTHER)).toBe(true);

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual(["default"]);
        expect(await appState.readProfileData(OTHER)).toBeNull();
    });

    it("refuses to delete the profile being displayed", async () => {
        // Removing it would leave the application with nothing to render and the registry
        // naming a profile that is gone - and the recovery for that is reseeding one nobody
        // asked for, which is how the stray profiles happened in the first place.
        await addProfile(OTHER, "Spare", 0);
        await manager.refresh();

        expect(await manager.deleteProfile("default")).toBe(false);
        expect(profiles.getProfiles().map(profile => profile.id)).toContain("default");
    });

    it("deletes every profile except the one being displayed", async () => {
        await addProfile(OTHER, "Default", 0);
        await addProfile(THIRD, "Default", 0);
        await manager.refresh();

        expect(await manager.deleteEveryOtherProfile()).toBe(2);

        expect(profiles.getProfiles().map(profile => profile.id)).toEqual(["default"]);
    });

    it("never empties the registry, whatever is asked of it", async () => {
        await addProfile(OTHER, "Spare", 0);
        await manager.refresh();

        await manager.deleteEveryOtherProfile();
        await manager.deleteProfile(profiles.getActiveProfileId());

        expect(profiles.getProfiles().length).toBeGreaterThan(0);
    });

    it("reports nothing to delete when there is only one profile", async () => {
        await manager.refresh();

        expect(manager.countDeletable()).toBe(0);
        expect(await manager.deleteEveryOtherProfile()).toBe(0);
    });

    it("keeps the list current after a deletion", async () => {
        await addProfile(OTHER, "Spare", 0);
        await manager.refresh();

        await manager.deleteProfile(OTHER);

        expect(manager.observables.profiles.get().map(row => row.id)).toEqual(["default"]);
    });
});
