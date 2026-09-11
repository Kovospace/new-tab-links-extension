import { beforeEach, describe, expect, it } from "vitest";

import { AppStateRepository } from "../../src/backend/repository/AppStateRepository";
import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { appStateInit } from "../../src/backend/datasource/init/AppStateInit";
import { ProfileManagerViewModel } from "../../src/viewModel/profileManagerViewModel";
import { emptyProfile, environment, link, profileOf } from "../support/profileDataFixtures";
import { MAX_NAME_LENGTH } from "../../src/backend/sync/SyncContracts";

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

    it("renames a profile without touching its identifier or its data", async () => {
        // The identifier is what the account, the baseline and every other device key the
        // profile by. A rename that changed it would read to synchronisation as a deletion
        // and a creation, and the data would go with the deleted one.
        await addProfile(OTHER, "Spare", 2);
        await manager.refresh();

        expect(await manager.renameProfile(OTHER, "Work")).toBe(true);

        expect(profiles.getProfiles().find(profile => profile.id === OTHER)?.name).toBe("Work");
        expect(Object.keys((await appState.readProfileData(OTHER))!.links)).toHaveLength(2);
    });

    it("renames the profile being displayed, unlike deleting it", async () => {
        // Nothing is lost and nothing is switched, so there is no reason to make the user
        // move off the profile first the way deletion does.
        await manager.refresh();

        expect(await manager.renameProfile("default", "Home")).toBe(true);

        expect(profiles.getProfiles().find(profile => profile.id === "default")?.name)
            .toBe("Home");
    });

    it("refuses a name that is blank once trimmed", async () => {
        await manager.refresh();

        expect(await manager.renameProfile("default", "   ")).toBe(false);

        expect(profiles.getProfiles().find(profile => profile.id === "default")?.name)
            .toBe("Default");
    });

    it("trims the name it is given", async () => {
        await manager.refresh();

        await manager.renameProfile("default", "  Home  ");

        expect(profiles.getProfiles().find(profile => profile.id === "default")?.name)
            .toBe("Home");
    });

    it("refuses a name too long for the account to store", async () => {
        // Not cosmetic. The backend validates @Size(max = 120) over the whole push request, so
        // an over-long name 400s the entire batch rather than being rejected on its own - one
        // long profile name would stop every other change reaching the account.
        await manager.refresh();

        expect(await manager.renameProfile("default", "x".repeat(MAX_NAME_LENGTH + 1)))
            .toBe(false);

        expect(profiles.getProfiles().find(profile => profile.id === "default")?.name)
            .toBe("Default");
    });

    it("accepts a name of exactly the maximum length", async () => {
        await manager.refresh();

        const longest = "x".repeat(MAX_NAME_LENGTH);
        expect(await manager.renameProfile("default", longest)).toBe(true);

        expect(profiles.getProfiles().find(profile => profile.id === "default")?.name)
            .toBe(longest);
    });

    it("keeps the list current after a rename", async () => {
        await addProfile(OTHER, "Spare", 0);
        await manager.refresh();

        await manager.renameProfile(OTHER, "Work");

        expect(manager.observables.profiles.get().find(row => row.id === OTHER)?.name)
            .toBe("Work");
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
