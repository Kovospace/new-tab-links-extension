import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { SettingsViewModel } from "../../src/viewModel/settingsViewModel";
import {
    DevicePreferencesRepository, MAX_SCALE, MIN_SCALE, SCALE_STEP
} from "../../src/backend/repository/DevicePreferencesRepository";

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

    /** One setting of the first category, asserted to be a switch rather than a slider. */
    const toggleAt = (index: number) => {
        const setting = firstCategory().settings[index];
        if (setting.kind !== "toggle") {
            throw new Error(`setting ${index} is a ${setting.kind}, not a toggle`);
        }
        return setting;
    };

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

        expect(toggleAt(0).enabled).toBe(true);
    });

    it("stores a setting the user turns on", async () => {
        await settings.toggle("enableDragAndDrop", true);

        expect(profiles.getSettings().enableDragAndDrop).toBe(true);
        expect(toggleAt(0).enabled).toBe(true);
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
        expect(toggleAt(0).enabled).toBe(true);
    });
});

/**
 *  The size of the interface, which is the first setting here that is a number and the first
 *  that belongs to the browser rather than to the profile.
 */
describe("SettingsViewModel, the size setting", () => {

    let profiles: ProfileRepository;
    let devicePreferences: DevicePreferencesRepository;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        profiles = new ProfileRepository();
        await profiles.init();
        devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        settings = new SettingsViewModel(profiles, devicePreferences);
        settings.refresh();
    });

    /** The slider of the first category, asserted to be one. */
    const slider = () => {
        const setting = settings.observables.settings.get().categories[0].settings
            .find(one => one.kind === "range");
        if (!setting || setting.kind !== "range") {
            throw new Error("no range setting on the first category");
        }
        return setting;
    };

    it("offers the range the browser can be drawn at", () => {
        expect(slider().min).toBe(MIN_SCALE);
        expect(slider().max).toBe(MAX_SCALE);
        expect(slider().step).toBe(SCALE_STEP);
        expect(slider().value).toBe(1);
        expect(slider().display).toBe("100%");
    });

    it("stores a size the user drags to, and says so in words", async () => {
        await settings.setRange("uiScale", 1.25);

        expect(devicePreferences.getScale()).toBe(1.25);
        expect(slider().value).toBe(1.25);
        expect(slider().display).toBe("125%");
    });

    it("applies it to the page, which is the point of dragging it", async () => {
        await settings.setRange("uiScale", 1.25);

        expect(document.documentElement.style.fontSize).toBe("1.25em");
    });

    it("does not touch the profile, which has no say in how big a screen is", async () => {
        // Every publication of profiles$ is a push to the account. A size that travelled would
        // let a desktop decide what a laptop looks like.
        let published = 0;
        profiles.profiles$.subscribe(() => published++);
        const before = published;

        await settings.setRange("uiScale", 1.25);

        expect(published).toBe(before);
        expect(profiles.getSettings()).toEqual({ enableDragAndDrop: false, hideTips: false });
    });
});
