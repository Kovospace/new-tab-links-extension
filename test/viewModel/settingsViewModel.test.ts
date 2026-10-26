import { beforeEach, describe, expect, it } from "vitest";

import { ProfileRepository } from "../../src/backend/repository/ProfileRepository";
import { DEFAULT_PROFILE_SETTINGS } from "../../src/backend/entity/ProfileSettings";
import { SettingsViewModel } from "../../src/viewModel/settingsViewModel";
import { readClosedTabs, recordClosedTab } from "../../src/backend/repository/ClosedTabsRepository";
import { readVisits, recordVisit } from "../../src/backend/repository/VisitsRepository";
import {
    DevicePreferencesRepository, MAX_SCALE, MIN_SCALE, SCALE_STEP
} from "../../src/backend/repository/DevicePreferencesRepository";
import { BackgroundImageRepository } from "../../src/backend/repository/BackgroundImageRepository";
import { BackgroundLibraryRepository } from "../../src/backend/repository/BackgroundLibraryRepository";
import { BUILT_IN_BACKGROUNDS } from "../../src/backend/entity/BuiltInBackgrounds";
import { memoryBackgroundUploads } from "../support/memoryBackgroundUploads";

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
        await profiles.updateSettings({ enableDragAndDrop: false });
        settings.refresh();

        expect(toggleAt(0).enabled).toBe(false);
    });

    it("stores a setting the user changes", async () => {
        // Dragging is on by default, so turning it off is the change there is to store.
        await settings.toggle("enableDragAndDrop", false);

        expect(profiles.getSettings().enableDragAndDrop).toBe(false);
        expect(toggleAt(0).enabled).toBe(false);
    });

    it("puts recording closed tabs under Privacy, on, asking before it is turned off", () => {
        const privacy = shown().categories.find(category => category.key === "privacy");
        const setting = privacy?.settings.find(candidate => candidate.key === "recordClosedTabs");

        expect(setting?.kind).toBe("toggle");
        if (setting?.kind === "toggle") {
            expect(setting.enabled).toBe(true);
            expect(setting.confirmOff).not.toBeNull();
        }
    });

    it("deletes the profile's closed tabs when recording them is turned off", async () => {
        const profileId = profiles.getActiveProfileId();
        await recordClosedTab(profileId, {
            url: "https://example.com/one", title: "One", closedAt: Date.now()
        });

        await settings.toggle("recordClosedTabs", false);

        expect(await readClosedTabs(profileId)).toEqual({});
        expect(profiles.getSettings().recordClosedTabs).toBe(false);
    });

    it("keeps the closed tabs when some other setting is turned off", async () => {
        const profileId = profiles.getActiveProfileId();
        await recordClosedTab(profileId, {
            url: "https://example.com/one", title: "One", closedAt: Date.now()
        });

        await settings.toggle("hideTips", false);

        expect(Object.keys(await readClosedTabs(profileId))).toHaveLength(1);
    });

    it("puts recording browsing history under Privacy, off, asking before it is turned off", () => {
        const privacy = shown().categories.find(category => category.key === "privacy");
        const setting = privacy?.settings.find(candidate => candidate.key === "recordBrowsingHistory");

        expect(setting?.kind).toBe("toggle");
        if (setting?.kind === "toggle") {
            expect(setting.enabled).toBe(false);
            expect(setting.confirmOff).not.toBeNull();
        }
    });

    it("deletes the profile's browsing history when recording it is turned off", async () => {
        const profileId = profiles.getActiveProfileId();
        await settings.toggle("recordBrowsingHistory", true);
        await recordVisit(profileId, { url: "https://example.com/", title: "", visitedAt: Date.now() }, 50);

        await settings.toggle("recordBrowsingHistory", false);

        expect(await readVisits(profileId)).toEqual({});
        expect(profiles.getSettings().recordBrowsingHistory).toBe(false);
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
        expect(profiles.getSettings()).toEqual(DEFAULT_PROFILE_SETTINGS);
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
        expect(profiles.getSettings()).toEqual(DEFAULT_PROFILE_SETTINGS);
    });
});

/**
 *  The language and date format section.
 *
 *  Both are the device's, like the size slider and for the same reason - and the one thing
 *  here that really can go wrong is the answer to "did anything change", because that is what
 *  decides whether the page is torn down and rebuilt in front of the user.
 */
describe("SettingsViewModel, the closed-tabs opening delay", () => {

    let devicePreferences: DevicePreferencesRepository;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        settings = new SettingsViewModel(profiles, devicePreferences);
        settings.refresh();
    });

    const delaySlider = () => {
        const setting = settings.observables.settings.get().categories[0].settings
            .find(one => one.kind === "range" && one.key === "closedTabsOpenDelay");
        if (!setting || setting.kind !== "range") {
            throw new Error("no closed-tabs delay on the first category");
        }
        return setting;
    };

    it("sits in UI and behavior, at 300 ms", () => {
        expect(delaySlider().value).toBe(300);
        expect(delaySlider().display).toBe("300 ms");
    });

    it("stores a delay the user drags to, on this device", async () => {
        await settings.setRange("closedTabsOpenDelay", 1000);

        expect(devicePreferences.getClosedTabsOpenDelay()).toBe(1000);
        expect(delaySlider().display).toBe("1000 ms");
    });
});

describe("SettingsViewModel, the bookmarking shortcut", () => {

    let shortcut: string | null;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        shortcut = "Alt+Shift+D";
        const profiles = new ProfileRepository();
        await profiles.init();
        const devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        settings = new SettingsViewModel(profiles, devicePreferences, undefined,
            async () => shortcut);
        settings.refresh();
    });

    const row = () => {
        const setting = settings.observables.settings.get().categories[0].settings
            .find(one => one.kind === "shortcut");
        if (!setting || setting.kind !== "shortcut") {
            throw new Error("no shortcut on the first category");
        }
        return setting;
    };

    it("sits in UI and behavior and shows what Chrome has it bound to", async () => {
        await settings.refreshShortcut();

        expect(row().shortcut).toBe("Alt+Shift+D");
        expect(row().display).toBe("Alt+Shift+D");
    });

    it("says so when nothing is bound", async () => {
        shortcut = null;
        await settings.refreshShortcut();

        expect(row().shortcut).toBeNull();
        expect(row().display).toBe("Not set");
    });

    it("shows a shortcut changed elsewhere once it is asked again", async () => {
        // It is changed on Chrome's page in another tab; the dialog asks again on focus.
        await settings.refreshShortcut();
        shortcut = "Ctrl+D";
        await settings.refreshShortcut();

        expect(row().display).toBe("Ctrl+D");
    });
});

describe("SettingsViewModel, language and local customs", () => {

    let profiles: ProfileRepository;
    let devicePreferences: DevicePreferencesRepository;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        (globalThis as { chrome?: unknown }).chrome = {
            ...(globalThis as { chrome?: object }).chrome,
            i18n: { getUILanguage: () => "en-GB" }
        };
        profiles = new ProfileRepository();
        await profiles.init();
        devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        settings = new SettingsViewModel(profiles, devicePreferences);
        settings.refresh();
    });

    const section = () => settings.observables.settings.get().categories
        .find(category => category.key === "language-and-local-customs")!;

    const choice = (key: string) => {
        const setting = section().settings.find(one => one.key === key);
        if (!setting || setting.kind !== "choice") {
            throw new Error(`${key} is not a choice setting`);
        }
        return setting;
    };

    it("offers a section of its own", () => {
        expect(section()).toBeDefined();
        expect(section().settings.map(one => one.key)).toEqual(["language", "dateFormat"]);
    });

    /**
     *  A device nobody has answered follows the browser. Storing the guessed language instead
     *  would freeze it: a browser that changed language afterwards would be ignored for ever.
     */
    it("starts out following the browser", () => {
        expect(choice("language").value).toBe("auto");
    });

    it("offers every language, each named in itself", () => {
        const labels = choice("language").options.map(option => option.label);
        expect(labels).toContain("English");
        expect(labels).toContain("Slovenčina");
    });

    /**
     *  The whole point of showing a sample: two of the formats differ only in which number
     *  comes first, and their names alone do not tell them apart at a glance.
     */
    it("shows each date format writing the same day", () => {
        const labels = choice("dateFormat").options.map(option => option.label);
        expect(labels.some(label => label.includes("25/03/2026"))).toBe(true);
        expect(labels.some(label => label.includes("03/25/2026"))).toBe(true);
    });

    it("stores a chosen language and reports that the page has to be rebuilt", async () => {
        const rebuild = await settings.setChoice("language", "sk");

        expect(rebuild).toBe(true);
        expect(devicePreferences.getLanguage()).toBe("sk");
        expect(choice("language").value).toBe("sk");
    });

    /**
     *  Reloading the page is what a language change costs, so it has to be the price of an
     *  actual change. Choosing the language already in force - which a dropdown will happily
     *  report - would otherwise throw the user's screen away for nothing.
     */
    it("does not ask for a rebuild when the language did not change", async () => {
        await settings.setChoice("language", "sk");

        expect(await settings.setChoice("language", "sk")).toBe(false);
    });

    /** The date format is read where a date is drawn, so nothing has to be rebuilt for it. */
    it("stores a date format without asking for a rebuild", async () => {
        const rebuild = await settings.setChoice("dateFormat", "isoDashes");

        expect(rebuild).toBe(false);
        expect(devicePreferences.getDateFormat()).toBe("isoDashes");
        expect(choice("dateFormat").value).toBe("isoDashes");
    });

    it("refuses a language it does not have, and keeps following the browser", async () => {
        await settings.setChoice("language", "de");

        expect(devicePreferences.getLanguage()).toBe("auto");
    });
});

describe("SettingsViewModel, the search engine", () => {

    let devicePreferences: DevicePreferencesRepository;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        settings = new SettingsViewModel(profiles, devicePreferences);
        settings.refresh();
    });

    const engine = () => {
        const section = settings.observables.settings.get().categories
            .find(category => category.key === "search")!;
        const setting = section.settings.find(one => one.key === "searchEngine");
        if (!setting || setting.kind !== "choice") {
            throw new Error("searchEngine is not a choice setting");
        }
        return setting;
    };

    it("offers the browser's own engine first, then each other engine by its own name", () => {
        expect(engine().options.map(option => option.label))
            .toEqual(["Default search engine", "Google", "DuckDuckGo", "Bing"]);
        expect(engine().value).toBe("browser");
    });

    it("stores the chosen engine on the device, without asking for a rebuild", async () => {
        const rebuild = await settings.setChoice("searchEngine", "bing");

        expect(rebuild).toBe(false);
        expect(devicePreferences.getSearchEngine()).toBe("bing");
        expect(engine().value).toBe("bing");
    });
});

/**
 *  "Keep the side panel open": a checkbox like the profile's, but the device's - stored with
 *  the size and the delay, never on the profile and so never pushed to the account.
 */
describe("SettingsViewModel, keeping the side panel open", () => {

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

    const keepOpen = () => settings.observables.settings.get().categories
        .flatMap(category => category.settings)
        .find(one => one.kind === "toggle" && one.key === "keepSidePanelOpen");

    it("is offered under UI and behavior, off", () => {
        expect(settings.observables.settings.get().categories[0].settings).toContain(keepOpen());
        expect(keepOpen()).toMatchObject({ enabled: false });
    });

    it("is stored on this device and not on the profile", async () => {
        let published = 0;
        profiles.profiles$.subscribe(() => published++);
        const before = published;

        await settings.toggle("keepSidePanelOpen", true);

        expect(devicePreferences.getKeepSidePanelOpen()).toBe(true);
        expect(keepOpen()).toMatchObject({ enabled: true });
        expect(published).toBe(before);
        expect(profiles.getSettings()).toEqual(DEFAULT_PROFILE_SETTINGS);
    });

    const closeOnClick = () => settings.observables.settings.get().categories
        .flatMap(category => category.settings)
        .find(one => one.kind === "toggle" && one.key === "closeSidePanelOnClick");

    it("offers closing the panel by a click under UI and behavior, off, stored on this device", async () => {
        expect(settings.observables.settings.get().categories[0].settings).toContain(closeOnClick());
        expect(closeOnClick()).toMatchObject({ enabled: false });
        let published = 0;
        profiles.profiles$.subscribe(() => published++);
        const before = published;

        await settings.toggle("closeSidePanelOnClick", true);

        expect(devicePreferences.getCloseSidePanelOnClick()).toBe(true);
        expect(closeOnClick()).toMatchObject({ enabled: true });
        expect(published).toBe(before);
        expect(profiles.getSettings()).toEqual(DEFAULT_PROFILE_SETTINGS);
    });
});

/**
 *  "Sync & privacy" (#97): whether this browser synchronises, and whether it shares each log.
 *  The log switches are the device's, and are greyed out and unticked while the profile does
 *  not record that log or the browser does not synchronise - the stored choice stays beneath.
 */
describe("SettingsViewModel, what is synchronised", () => {

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

    const privacy = () => settings.observables.settings.get().categories
        .find(category => category.key === "privacy")!;
    const toggle = (key: string) => {
        const setting = privacy().settings.find(candidate => candidate.key === key);
        if (!setting || setting.kind !== "toggle") {
            throw new Error(`no toggle ${key}`);
        }
        return setting;
    };

    it("offers the switch for the whole browser and one per log, in Sync & privacy", () => {
        expect(privacy().title).toBe("Sync & privacy");
        expect(privacy().settings.map(setting => setting.key)).toEqual([
            "syncEnabled", "recordClosedTabs", "syncClosedTabs",
            "recordBrowsingHistory", "syncBrowsingHistory"
        ]);
        expect(toggle("syncEnabled").enabled).toBe(true);
        expect(toggle("syncClosedTabs")).toMatchObject({ enabled: true, disabledReason: null });
    });

    it("greys out sharing a log the profile does not record", async () => {
        // Browsing history is not recorded by default.
        expect(toggle("syncBrowsingHistory").enabled).toBe(false);
        expect(toggle("syncBrowsingHistory").disabledReason).toMatch(/not recorded/);

        await profiles.updateSettings({ recordBrowsingHistory: true });
        settings.refresh();

        expect(toggle("syncBrowsingHistory")).toMatchObject({ enabled: true, disabledReason: null });
    });

    it("greys out both logs while the browser does not synchronise", async () => {
        await settings.toggle("syncEnabled", false);

        expect(devicePreferences.getSyncEnabled()).toBe(false);
        expect(toggle("syncClosedTabs").enabled).toBe(false);
        expect(toggle("syncClosedTabs").disabledReason).toMatch(/does not synchronise/);
    });

    it("stores a log's switch on this device, not on the profile", async () => {
        let published = 0;
        profiles.profiles$.subscribe(() => published++);
        const before = published;

        await settings.toggle("syncClosedTabs", false);

        expect(devicePreferences.getSyncClosedTabs()).toBe(false);
        expect(devicePreferences.logSync$.get()).toEqual({ closedTabs: false, visits: true });
        expect(toggle("syncClosedTabs").enabled).toBe(false);
        expect(published).toBe(before);
    });
});

/** The theme style (#107), a choice beside the theme, applied without a reload. */
describe("SettingsViewModel, the theme style", () => {

    let devicePreferences: DevicePreferencesRepository;
    let settings: SettingsViewModel;

    beforeEach(async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        settings = new SettingsViewModel(profiles, devicePreferences);
        settings.refresh();
    });

    const themeStyle = () => settings.observables.settings.get().categories[0].settings
        .find(setting => setting.key === "themeStyle");

    it("is offered right after the theme, flat or aero, on aero", () => {
        const keys = settings.observables.settings.get().categories[0].settings.map(setting => setting.key);
        expect(keys.indexOf("themeStyle")).toBe(keys.indexOf("theme") + 1);
        expect(themeStyle()).toMatchObject({
            kind: "choice", value: "aero",
            options: [{ value: "flat", label: "Flat" }, { value: "aero", label: "Aero (transparent, blurred)" }]
        });
    });

    it("stores a style chosen, without asking for a reload", async () => {
        expect(await settings.setChoice("themeStyle", "flat")).toBe(false);

        expect(devicePreferences.getThemeStyle()).toBe("flat");
        expect(themeStyle()).toMatchObject({ value: "flat" });
    });
});


/** The background picture is open to every account: no premium check, nothing greyed out. */
describe("SettingsViewModel, the background library", () => {

    it("is a section of its own, open to every account, listing the pictures as tiles", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        const images = new BackgroundImageRepository();
        await images.init();
        const library = new BackgroundLibraryRepository(images, memoryBackgroundUploads(), async () => "data:x");
        const settings = new SettingsViewModel(profiles, devicePreferences, library);
        await settings.loadBackgrounds();

        const section = settings.observables.settings.get().categories.find(category => category.key === "background")!;
        const picture = section.settings[0];
        expect(picture).toMatchObject({ kind: "image", disabledReason: null, noneSelected: true });
        if (picture.kind === "image") {
            expect(picture.tiles).toHaveLength(BUILT_IN_BACKGROUNDS.length);
        }

        expect(await settings.chooseBackground(BUILT_IN_BACKGROUNDS[2].id)).toBe("done");
        const chosen = settings.observables.settings.get().categories
            .find(category => category.key === "background")!.settings[0];
        expect(chosen).toMatchObject({ noneSelected: false });
    });

    it("says a built-in picture could not be had, rather than throwing", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        const images = new BackgroundImageRepository();
        await images.init();
        const offline = new BackgroundLibraryRepository(images, memoryBackgroundUploads(),
            async () => { throw new Error("offline"); });
        const settings = new SettingsViewModel(profiles, devicePreferences, offline);
        await settings.loadBackgrounds();

        expect(await settings.chooseBackground(BUILT_IN_BACKGROUNDS[0].id)).toBe("unavailable");
        expect(images.getImage()).toBeNull();
    });

    /**
     *  A picture the browser refused to store was reported as a failed download - the message
     *  sent people to check a connection that was fine, while their storage was full.
     */
    it("says the picture could not be kept when storage refuses it, not that the download failed", async () => {
        const profiles = new ProfileRepository();
        await profiles.init();
        const devicePreferences = new DevicePreferencesRepository();
        await devicePreferences.init();
        const images = new BackgroundImageRepository();
        await images.init();
        images.setImage = async () => { throw new Error("QUOTA_BYTES quota exceeded"); };
        const library = new BackgroundLibraryRepository(images, memoryBackgroundUploads(), async () => "data:4k");
        const settings = new SettingsViewModel(profiles, devicePreferences, library);
        await settings.loadBackgrounds();

        expect(await settings.chooseBackground(BUILT_IN_BACKGROUNDS[0].id)).toBe("noRoom");
    });
});
