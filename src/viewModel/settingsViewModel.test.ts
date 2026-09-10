import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../backend/repository/ProfileRepository";
import { SettingsViewModel } from "./settingsViewModel";

/**
 *  The settings screen is a list of categories over a profile's record. Two things about it
 *  are worth pinning: that what it shows is what the profile actually holds, and that folding
 *  a category away is a way of looking at the screen rather than a change to the profile - a
 *  fold that wrote to the registry would push an operation to the account, on every device,
 *  for a chevron.
 */
describe("SettingsViewModel", () => {

    let profiles: ProfileRepository;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();
        settings = new SettingsViewModel(profiles);
        settings.refresh();
    });

    const shown = () => settings.observables.settings.get();
    const firstCategory = () => shown().categories[0];

    it("puts the settings in categories, the first of them expanded", () => {
        expect(firstCategory().title).toBe("UI and behavior");
        expect(firstCategory().collapsed).toBe(false);
        expect(firstCategory().settings.map(one => one.key)).toContain("enableDragAndDrop");
    });

    it("names the profile the settings belong to", () => {
        // Settings ride on the profile record, so which profile is loaded decides what this
        // screen is about - and the menu it is opened from does not say.
        expect(shown().profileName).toBe("Default");
    });

    it("shows what the profile actually holds", async () => {
        await profiles.updateSettings({ enableDragAndDrop: true });
        settings.refresh();

        expect(firstCategory().settings[0].enabled).toBe(true);
    });

    it("stores a setting the user turns on", async () => {
        await settings.toggle("enableDragAndDrop", true);

        expect(profiles.getSettings().enableDragAndDrop).toBe(true);
        expect(firstCategory().settings[0].enabled).toBe(true);
    });

    it("folds a category away and back", () => {
        settings.toggleCategory(firstCategory().key);
        expect(firstCategory().collapsed).toBe(true);

        settings.toggleCategory(firstCategory().key);
        expect(firstCategory().collapsed).toBe(false);
    });

    it("does not touch the profile when a category is folded away", () => {
        // profiles$ is what schedules a push, so firing it for a chevron would send an
        // operation to the account and to every other device for nothing at all.
        let published = 0;
        profiles.profiles$.subscribe(() => published++);
        const before = published;

        settings.toggleCategory(firstCategory().key);

        expect(published).toBe(before);
        expect(profiles.getSettings()).toEqual({ enableDragAndDrop: false, hideTips: false });
    });

    it("keeps a folded category folded while the settings on it change", async () => {
        settings.toggleCategory(firstCategory().key);

        await settings.toggle("enableDragAndDrop", true);

        expect(firstCategory().collapsed).toBe(true);
        expect(firstCategory().settings[0].enabled).toBe(true);
    });
});
