import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { ProfileSettings, ToggleableSetting } from "../backend/entity/ProfileSettings";
import { writeClosedTabs } from "../backend/repository/ClosedTabsRepository";
import { writeVisits } from "../backend/repository/VisitsRepository";
import {
    DevicePreferencesRepository, devicePreferencesRepository,
    CLOSED_TABS_OPEN_DELAY_STEP, MAX_CLOSED_TABS_OPEN_DELAY, MAX_SCALE,
    MIN_CLOSED_TABS_OPEN_DELAY, MIN_SCALE, SCALE_STEP, THEME_STYLES, THEMES
} from "../backend/repository/DevicePreferencesRepository";

import {
    DATE_FORMATS, DateFormatId, sampleOf
} from "../i18n/dates";
import { t } from "../i18n/i18n";
import { openShortcutsPage, readBookmarkShortcut, SHORTCUTS_PAGE } from "../utils/extensionShortcuts";
import { SEARCH_ENGINES } from "../backend/entity/SearchEngines";
import {
    BackgroundLibraryRepository, backgroundLibraryRepository, BackgroundStorageError, BackgroundUnavailableError
} from "../backend/repository/BackgroundLibraryRepository";

/**
 *  How putting a picture behind the page went, so the dialog can say which thing went wrong:
 *  a picture that could not be downloaded, one that could not be kept, or a file that is not a
 *  picture. They used to share one message, which blamed the download for a full storage.
 */
export type BackgroundOutcome = "done" | "unavailable" | "noRoom" | "unreadable";
import { downscaleImage, THUMBNAIL_SIDE } from "../utils/imageDownscale";
import { engineDTO } from "./searchBarViewModel";
import { AUTOMATIC_LANGUAGE, baseLanguageOf, browserLanguageTag, SUPPORTED_LANGUAGES }
    from "../i18n/languages";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** What every setting has to say for itself, whatever kind it is. */
interface SettingCommonDTO {

    /** What it is called in the dialog. */
    title: string;

    /** What it does, in a sentence. */
    explanation: string;

    /**
     *  Why it cannot be changed at the moment, or null when it can.
     *
     *  There is one such reason coming already: TODOS.md has "open links in separate tabs"
     *  greying out a subgroup's "catch links into tab group", because the two contradict each
     *  other. Saying why beats a control that silently does nothing.
     */
    disabledReason: string | null;
}

/** A setting that is on or off. */
/**
 *  The on/off settings that belong to this browser rather than to the profile - stored in the
 *  device preferences and never synchronised, but drawn as any other checkbox.
 */
export type DeviceToggleKey =
    "keepSidePanelOpen" | "closeSidePanelOnClick" | "syncEnabled" | "syncClosedTabs" | "syncBrowsingHistory";

/** Every on/off setting: the profile's, and this device's. */
export type ToggleSettingKey = ToggleableSetting | DeviceToggleKey;

const DEVICE_TOGGLES: ReadonlySet<ToggleSettingKey> = new Set<DeviceToggleKey>(
    ["keepSidePanelOpen", "closeSidePanelOnClick", "syncEnabled", "syncClosedTabs", "syncBrowsingHistory"]);

/** The device toggles that share a log, with the profile setting that decides it is recorded. */
const LOG_SYNC_TOGGLES: Partial<Record<DeviceToggleKey, ToggleableSetting>> = {
    syncClosedTabs: "recordClosedTabs",
    syncBrowsingHistory: "recordBrowsingHistory"
};

function isDeviceToggle(key: ToggleSettingKey): key is DeviceToggleKey {
    return DEVICE_TOGGLES.has(key);
}

export interface ToggleSettingDTO extends SettingCommonDTO {
    kind: "toggle";
    /** Which setting this is; what `toggle` is called with. */
    key: ToggleSettingKey;
    enabled: boolean;
    /**
     *  What to ask before turning it off, already worded, or null when turning it off needs no
     *  question. Set on a setting whose "off" deletes something, which is not undone by
     *  turning it back on.
     */
    confirmOff: { title: string; message: string; confirm: string } | null;
}

/**
 *  A setting that is a number on a slider.
 *
 *  Its own kind rather than a number in a text field: the value means nothing to anybody as a
 *  number - 0.8125 of what? - and everything as a position with the effect visible behind it.
 */
export interface RangeSettingDTO extends SettingCommonDTO {
    kind: "range";
    /** Which setting this is; what `setRange` is called with. */
    key: RangeSettingKey;
    value: number;
    min: number;
    max: number;
    step: number;
    /** The value as it is shown beside the slider, already worded. */
    display: string;
}

/**
 *  A setting that is one of a closed list of answers.
 *
 *  Its own kind rather than a row of toggles: the answers are mutually exclusive, and there
 *  are already seven of them between the two settings that need this - a row of seven
 *  switches that turn each other off is a dropdown drawn the hard way.
 */
export interface ChoiceSettingDTO extends SettingCommonDTO {
    kind: "choice";
    /** Which setting this is; what `setChoice` is called with. */
    key: ChoiceSettingKey;
    value: string;
    options: SettingOptionDTO[];
}

/** One answer a choice setting offers. */
export interface SettingOptionDTO {
    value: string;
    label: string;
}

/** One tile of the background library. */
export interface BackgroundTileDTO {
    id: string;
    /** What the tile shows: an extension path or a data URL. */
    thumbnail: string;
    /** Whether it is the picture behind the page now. */
    selected: boolean;
}

/**
 *  The background: a library of pictures to choose from as tiles - the built-in ones and the
 *  user's own - with "none" and "add your own" beside them (#127). Open to every account.
 */
export interface ImageSettingDTO extends SettingCommonDTO {
    kind: "image";
    /** Which setting this is. One so far. */
    key: ImageSettingKey;
    /** The user's own pictures first, newest first, then the built-in ones not removed. */
    tiles: BackgroundTileDTO[];
    /** Whether no picture is behind the page. */
    noneSelected: boolean;
}

/**
 *  A keyboard shortcut: what it is set to, and a way to the page where it is changed.
 *
 *  Not editable here, because it cannot be: Chrome gives an extension no way to set its own
 *  shortcut, only to read it - see `utils/extensionShortcuts.ts`.
 */
export interface ShortcutSettingDTO extends SettingCommonDTO {
    kind: "shortcut";
    /** Which shortcut this is. One so far. */
    key: ShortcutSettingKey;
    /** What it is bound to ("Alt+Shift+D"), or null when nothing is. */
    shortcut: string | null;
    /** The value as it is shown beside the name, already worded. */
    display: string;
}

/** One setting, as the dialog draws it. */
export type SettingDTO =
    ToggleSettingDTO | RangeSettingDTO | ChoiceSettingDTO | ImageSettingDTO | ShortcutSettingDTO;

/** The settings that are a keyboard shortcut. */
export type ShortcutSettingKey = "bookmarkShortcut";

/** The settings that are a picture. */
export type ImageSettingKey = "backgroundImage";

/** The settings that are numbers. */
export type RangeSettingKey = "uiScale" | "closedTabsOpenDelay";

/** The settings that are a choice out of a list. */
export type ChoiceSettingKey = "language" | "dateFormat" | "searchEngine" | "theme" | "themeStyle";

/** A named group of settings, which the dialog draws as one collapsible section. */
export interface SettingCategoryDTO {

    /** Which category this is; what `toggleCategory` is called with. */
    key: string;

    /** What it is called in the dialog. */
    title: string;

    /** Whether it is folded away right now. */
    collapsed: boolean;

    /** The settings in it, in the order they should be offered. */
    settings: SettingDTO[];
}

/** The settings screen: which profile it is about, and what is on it. */
export interface SettingsDTO {
    profileName: string;
    categories: SettingCategoryDTO[];
}

/**
 *  What a setting is, and where it belongs, independent of what it is set to.
 *
 *  It names its wording rather than carrying it: a definition list is evaluated when this
 *  module is imported, which is before the page knows what language it is being drawn in, so
 *  a title written here as a string would be the fallback language's title for ever. `wording`
 *  is the key its title and explanation live under in `settings.json`, and both are read at
 *  the moment the dialog is described.
 */
type SettingDefinition =
    | { kind: "toggle"; key: ToggleSettingKey; wording: string; confirmOff?: boolean }
    | { kind: "range"; key: RangeSettingKey; wording: string }
    | { kind: "choice"; key: ChoiceSettingKey; wording: string }
    | { kind: "image"; key: ImageSettingKey; wording: string }
    | { kind: "shortcut"; key: ShortcutSettingKey; wording: string };

/** A category, and what is in it. */
interface CategoryDefinition {
    key: string;
    /** Key under `settings.categories` holding what this section is called. */
    wording: string;
    settings: SettingDefinition[];
}

/** The category holding what the profile records; the closed tabs panel opens Settings on it. */
export const PRIVACY_CATEGORY = "privacy";

/**
 *  Every setting there is, in the order and the sections the dialog shows them in.
 *
 *  One list rather than a shape assembled in the dialog: adding a setting should be adding a
 *  line here, and nothing else. A category with nothing in it is not drawn, so a section can
 *  be declared before the setting that fills it exists.
 */
const CATEGORIES: CategoryDefinition[] = [
    {
        key: "ui-and-behavior",
        wording: "uiAndBehavior",
        settings: [
            { kind: "toggle", key: "enableDragAndDrop", wording: "enableDragAndDrop" },
            { kind: "toggle", key: "hideTips", wording: "hideTips" },
            { kind: "choice", key: "theme", wording: "theme" },
            { kind: "choice", key: "themeStyle", wording: "themeStyle" },
            { kind: "range", key: "uiScale", wording: "uiScale" },
            { kind: "range", key: "closedTabsOpenDelay", wording: "closedTabsOpenDelay" },
            { kind: "toggle", key: "keepSidePanelOpen", wording: "keepSidePanelOpen" },
            { kind: "toggle", key: "closeSidePanelOnClick", wording: "closeSidePanelOnClick" },
            { kind: "shortcut", key: "bookmarkShortcut", wording: "bookmarkShortcut" }
        ]
    },
    {
        // A section of its own: the library of pictures is a grid of tiles, not a row.
        key: "background",
        wording: "background",
        settings: [
            { kind: "image", key: "backgroundImage", wording: "backgroundImage" }
        ]
    },
    {
        // Two questions rather than one, because they are two: the language decides the words
        // and the date format decides the order the parts of a date go in, and a reader can
        // want one without the other - see i18n/dates.ts.
        key: "language-and-local-customs",
        wording: "languageAndLocalCustoms",
        settings: [
            { kind: "choice", key: "language", wording: "language" },
            { kind: "choice", key: "dateFormat", wording: "dateFormat" }
        ]
    },
    {
        // What this profile records about the user's browsing. Turning a recorder off deletes
        // what it recorded, here and on the account, which is why it asks first.
        key: PRIVACY_CATEGORY,
        wording: "privacy",
        settings: [
            // Synchronising first: it is the switch the two below hang from. All three are this
            // browser's, beside the profile's recording settings they are about.
            { kind: "toggle", key: "syncEnabled", wording: "syncEnabled" },
            { kind: "toggle", key: "recordClosedTabs", wording: "recordClosedTabs", confirmOff: true },
            { kind: "toggle", key: "syncClosedTabs", wording: "syncClosedTabs" },
            { kind: "toggle", key: "recordBrowsingHistory", wording: "recordBrowsingHistory", confirmOff: true },
            { kind: "toggle", key: "syncBrowsingHistory", wording: "syncBrowsingHistory" }
        ]
    },
    {
        // The same choice the search bar's own dropdown makes; this is where somebody looking
        // for it in Settings finds it.
        key: "search",
        wording: "search",
        settings: [
            { kind: "choice", key: "searchEngine", wording: "searchEngine" }
        ]
    }
];

/** The category a new dialog opens with expanded: the first one, and only the first one. */
const FIRST_CATEGORY = CATEGORIES[0]?.key;

/**
 *  View model behind the settings dialog.
 *
 *  It does not extend AbstractViewModel, for the same reason ProfileManagerViewModel does not:
 *  that base class maps AppState onto a component's DTO, and settings are the profile registry
 *  rather than the state - they are the same whichever workspace happens to be open.
 *
 *  **Settings belong to the profile**, so this reads and writes the active profile's record
 *  and nothing else. That is also what synchronises them: the registry changing fires
 *  profiles$, which is what the sync coordinator is already listening to.
 *
 *  **Which categories are folded away is not one of the settings.** It is not stored and not
 *  synchronised - it lives here, for as long as the dialog is open, the way which workspace is
 *  open is a per-device choice rather than data. A dialog opened again starts with the first
 *  category expanded and the rest folded, which is the state that makes a growing list
 *  readable.
 */
export class SettingsViewModel {

    private LOG: Logger = new Logger("SettingsViewModel");

    private readonly profiles: ProfileRepository;
    private readonly devicePreferences: DevicePreferencesRepository;
    private readonly backgrounds: BackgroundLibraryRepository;
    private readonly shortcutReader: () => Promise<string | null>;

    /** What saving a page is bound to, as last read; Chrome answers asynchronously. */
    private bookmarkShortcut: string | null = null;

    /** Categories the user has folded away; the first one starts out of it. */
    private readonly collapsed: Set<string> = new Set(
        CATEGORIES.map(category => category.key).filter(key => key !== FIRST_CATEGORY));

    public readonly observables = {
        settings: new ObservableValue<SettingsDTO>({ profileName: "", categories: [] })
    };

    /**
     *  @param profiles          the profile registry; the singleton in normal use
     *  @param devicePreferences what this browser prefers, which the profile has no say in
     *  @param backgrounds       the library of pictures behind the page, kept on this device
     *  @param shortcutReader    reads the bookmarking shortcut; injectable for testing
     */
    constructor(
        profiles: ProfileRepository = profileRepository,
        devicePreferences: DevicePreferencesRepository = devicePreferencesRepository,
        backgrounds: BackgroundLibraryRepository = backgroundLibraryRepository,
        shortcutReader: () => Promise<string | null> = readBookmarkShortcut
    ) {
        this.shortcutReader = shortcutReader;
        this.profiles = profiles;
        this.devicePreferences = devicePreferences;
        this.backgrounds = backgrounds;
        this.backgrounds.tiles$.subscribe(() => this.refresh());
    }

    /**
     *  Reads the background library. Done when Settings opens rather than with every new tab:
     *  nothing else shows it, and it is a database to open.
     */
    public async loadBackgrounds(): Promise<void> {
        await this.backgrounds.init();
    }

    /** Loads the active profile's settings into the observable. */
    public refresh(): void {
        this.observables.settings.set(this.describe());
    }

    /**
     *  Asks Chrome what the bookmarking shortcut is now, and redraws.
     *
     *  Separate from `refresh()` because Chrome answers asynchronously, and called again when
     *  the page gets the focus back: the shortcut is changed on another tab, and somebody
     *  returning from it expects to see what they just set.
     */
    public async refreshShortcut(): Promise<void> {
        this.bookmarkShortcut = await this.shortcutReader();
        this.refresh();
    }

    /** Opens the page where Chrome lets the user change the shortcut. */
    public openShortcutSettings(): void {
        this.LOG.debug("openShortcutSettings", SHORTCUTS_PAGE);
        openShortcutsPage();
    }

    /**
     *  Turns one setting on or off and redraws.
     *
     *  @param key     which setting
     *  @param enabled what to set it to
     */
    public async toggle(key: ToggleSettingKey, enabled: boolean): Promise<void> {
        this.LOG.debug("toggle", `${key} -> ${enabled}`);
        if (isDeviceToggle(key)) {
            await this.setDeviceToggle(key, enabled);
            this.refresh();
            return;
        }
        if (key === "recordClosedTabs" && !enabled) {
            // Deleted before the setting moves, so the push the setting change causes carries
            // the deletions with it. The user was asked first - see `confirmOff`.
            await writeClosedTabs(this.profiles.getActiveProfileId(), {});
        }
        if (key === "recordBrowsingHistory" && !enabled) {
            // The same for the browsing history.
            await writeVisits(this.profiles.getActiveProfileId(), {});
        }
        await this.profiles.updateSettings({ [key]: enabled });
        this.refresh();
    }

    private deviceToggleValue(key: DeviceToggleKey): boolean {
        switch (key) {
            case "keepSidePanelOpen": return this.devicePreferences.getKeepSidePanelOpen();
            case "closeSidePanelOnClick": return this.devicePreferences.getCloseSidePanelOnClick();
            case "syncEnabled": return this.devicePreferences.getSyncEnabled();
            case "syncClosedTabs": return this.devicePreferences.getSyncClosedTabs();
            case "syncBrowsingHistory": return this.devicePreferences.getSyncBrowsingHistory();
        }
    }

    private setDeviceToggle(key: DeviceToggleKey, enabled: boolean): Promise<void> {
        switch (key) {
            case "keepSidePanelOpen": return this.devicePreferences.setKeepSidePanelOpen(enabled);
            case "closeSidePanelOnClick": return this.devicePreferences.setCloseSidePanelOnClick(enabled);
            case "syncEnabled": return this.devicePreferences.setSyncEnabled(enabled);
            case "syncClosedTabs": return this.devicePreferences.setSyncClosedTabs(enabled);
            case "syncBrowsingHistory": return this.devicePreferences.setSyncBrowsingHistory(enabled);
        }
    }

    /**
     *  Why a log's synchronisation cannot be changed right now, or null when it can: a log the
     *  profile does not record has nothing to share, and a browser that does not synchronise
     *  shares nothing. Drawn unticked and greyed out, saying which - the stored choice is kept
     *  underneath and comes back with whatever was blocking it.
     */
    private logSyncBlocked(key: DeviceToggleKey, settings: ProfileSettings): string | null {
        const recordedBy = LOG_SYNC_TOGGLES[key];
        if (!recordedBy) {
            return null;
        }
        if (!settings[recordedBy]) {
            return t(`settings.${key}.notRecorded`);
        }
        if (!this.devicePreferences.getSyncEnabled()) {
            return t("settings.syncEnabled.offBlocksLogs");
        }
        return null;
    }

    /**
     *  Moves a setting that is a number, and redraws.
     *
     *  Applied as well as stored, because the one this exists for resizes the interface the
     *  dialog itself is drawn in - a size that only took effect on the next page would be a
     *  slider with nothing behind it.
     *
     *  @param key   which setting
     *  @param value what to set it to; the repository clamps it to what is on offer
     */
    public async setRange(key: RangeSettingKey, value: number): Promise<void> {
        this.LOG.debug("setRange", `${key} -> ${value}`);
        if (key === "uiScale") {
            await this.devicePreferences.setScale(value);
            this.devicePreferences.applyScale();
        } else if (key === "closedTabsOpenDelay") {
            await this.devicePreferences.setClosedTabsOpenDelay(value);
        }
        this.refresh();
    }

    /**
     *  Answers a setting that is a choice out of a list, and redraws.
     *
     *  **Changing the language reports that the page has to be rebuilt** rather than doing it.
     *  Every string in this interface is read once, while its element is being built, so a
     *  language changed under a page already on screen changes nothing the user can see; the
     *  only honest redraw is a reload. Whether to reload, and how to come back to this dialog
     *  afterwards, is the dialog's business and not a view model's - so this says that it
     *  happened and lets the caller act.
     *
     *  @param key   which setting
     *  @param value what to set it to; each setting clamps it to what it offers
     *  @return whether the page has to be reloaded for the change to be visible
     */
    public async setChoice(key: ChoiceSettingKey, value: string): Promise<boolean> {

        this.LOG.debug("setChoice", `${key} -> ${value}`);

        if (key === "language") {
            const before = this.devicePreferences.getLanguage();
            await this.devicePreferences.setLanguage(value);
            this.refresh();
            return this.devicePreferences.getLanguage() !== before;
        }

        if (key === "searchEngine") {
            await this.devicePreferences.setSearchEngine(value);
            this.refresh();
            return false;
        }

        if (key === "theme") {
            // Repainted at once by the stylesheet; nothing to reload.
            await this.devicePreferences.setTheme(value);
            this.refresh();
            return false;
        }

        if (key === "themeStyle") {
            // The same: the stylesheet repaints the surfaces.
            await this.devicePreferences.setThemeStyle(value);
            this.refresh();
            return false;
        }

        await this.devicePreferences.setDateFormat(value);
        this.refresh();
        return false;
    }

    /**
     *  Adds a picture of the user's own to the library, shrunk first, and puts it behind the
     *  page. Any account may.
     *
     *  @param file the picture the user chose
     *  @return "done", or why not: a file that is not a picture, or one that could not be kept
     */
    public async setBackgroundImage(file: Blob): Promise<BackgroundOutcome> {
        let image: string;
        let thumbnail: string;
        try {
            [image, thumbnail] = await Promise.all([downscaleImage(file), downscaleImage(file, THUMBNAIL_SIDE)]);
        } catch (error) {
            this.LOG.warn("setBackgroundImage", `not a picture this browser can read: ${error}`);
            return "unreadable";
        }
        try {
            await this.backgrounds.add(image, thumbnail);
            return "done";
        } catch (error) {
            return this.outcomeOf("setBackgroundImage", error);
        }
    }

    /**
     *  Puts a tile's picture behind the page.
     *
     *  @param id the tile; null for no picture at all
     *  @return "done", or why not: a built-in picture that could not be downloaded, or a picture
     *          that could not be kept
     */
    public async chooseBackground(id: string | null): Promise<BackgroundOutcome> {
        try {
            if (id === null) {
                await this.backgrounds.chooseNone();
            } else {
                await this.backgrounds.choose(id);
            }
            return "done";
        } catch (error) {
            return this.outcomeOf(`chooseBackground ${id}`, error);
        }
    }

    /** Which message a failed background deserves; logged with its cause either way. */
    private outcomeOf(where: string, error: unknown): BackgroundOutcome {
        this.LOG.warn(where, `${error}`);
        if (error instanceof BackgroundUnavailableError) {
            return "unavailable";
        }
        if (error instanceof BackgroundStorageError) {
            return "noRoom";
        }
        return "unavailable";
    }

    /** Takes a tile out of the library - and its picture from behind the page, if it is there. */
    public async removeBackground(id: string): Promise<void> {
        await this.backgrounds.remove(id);
    }

    /**
     *  Folds a category away, or unfolds it, and redraws.
     *
     *  @param key which category
     */
    /**
     *  Unfolds one category and folds every other, for a dialog opened to answer one question -
     *  "where do I turn this back on" - rather than from the menu.
     */
    public expandOnly(key: string): void {
        this.collapsed.clear();
        CATEGORIES.filter(category => category.key !== key)
            .forEach(category => this.collapsed.add(category.key));
        this.refresh();
    }

    public toggleCategory(key: string): void {
        if (this.collapsed.has(key)) {
            this.collapsed.delete(key);
        } else {
            this.collapsed.add(key);
        }
        this.refresh();
    }

    /** One setting, as it stands, in the shape its kind is drawn from. */
    private describeSetting(
        definition: SettingDefinition,
        settings: ProfileSettings
    ): SettingDTO {

        const title = t(`settings.${definition.wording}.title`);
        const explanation = t(`settings.${definition.wording}.explanation`);

        if (definition.kind === "toggle") {
            return {
                kind: "toggle",
                key: definition.key,
                title,
                explanation,
                enabled: isDeviceToggle(definition.key)
                    ? this.deviceToggleValue(definition.key) && !this.logSyncBlocked(definition.key, settings)
                    : settings[definition.key],
                confirmOff: definition.confirmOff
                    ? {
                        title: t(`settings.${definition.wording}.confirmOff.title`),
                        message: t(`settings.${definition.wording}.confirmOff.message`),
                        confirm: t(`settings.${definition.wording}.confirmOff.confirm`)
                    }
                    : null,
                disabledReason: isDeviceToggle(definition.key)
                    ? this.logSyncBlocked(definition.key, settings)
                    : null
            };
        }

        if (definition.kind === "choice") {
            return {
                kind: "choice",
                key: definition.key,
                title,
                explanation,
                value: this.choiceValueOf(definition.key),
                options: choiceOptionsOf(definition.key),
                disabledReason: null
            };
        }

        if (definition.kind === "shortcut") {
            return {
                kind: "shortcut",
                key: definition.key,
                title,
                explanation,
                shortcut: this.bookmarkShortcut,
                display: this.bookmarkShortcut ?? t(`settings.${definition.wording}.notSet`),
                disabledReason: null
            };
        }

        if (definition.kind === "image") {
            return {
                kind: "image",
                key: definition.key,
                title,
                explanation,
                tiles: this.backgrounds.tiles$.get().map(({ id, thumbnail, selected }) => ({ id, thumbnail, selected })),
                noneSelected: !this.backgrounds.tiles$.get().some(tile => tile.selected),
                disabledReason: null
            };
        }

        if (definition.key === "closedTabsOpenDelay") {
            const delay = this.devicePreferences.getClosedTabsOpenDelay();
            return {
                kind: "range",
                key: definition.key,
                title,
                explanation,
                value: delay,
                min: MIN_CLOSED_TABS_OPEN_DELAY,
                max: MAX_CLOSED_TABS_OPEN_DELAY,
                step: CLOSED_TABS_OPEN_DELAY_STEP,
                display: t("settings.closedTabsOpenDelay.value", { milliseconds: delay }),
                disabledReason: null
            };
        }

        const value = this.devicePreferences.getScale();
        return {
            kind: "range",
            key: definition.key,
            title,
            explanation,
            value,
            min: MIN_SCALE,
            max: MAX_SCALE,
            step: SCALE_STEP,
            // As a percentage of the browser's own size, which is a number people have a feel
            // for; "0.8125em" is the same fact and means nothing at a glance.
            display: `${Math.round(value * 100)}%`,
            disabledReason: null
        };
    }

    /** What a choice setting is set to on this device. */
    private choiceValueOf(key: ChoiceSettingKey): string {
        switch (key) {
            case "language":
                return this.devicePreferences.getLanguage();
            case "searchEngine":
                return this.devicePreferences.getSearchEngine();
            case "theme":
                return this.devicePreferences.getTheme();
            case "themeStyle":
                return this.devicePreferences.getThemeStyle();
            default:
                return this.devicePreferences.getDateFormat();
        }
    }

    /** The active profile's settings, worded for the dialog and in their sections. */
    private describe(): SettingsDTO {

        const activeId = this.profiles.getActiveProfileId();
        const profile = this.profiles.getProfiles().find(one => one.id === activeId);
        const settings = this.profiles.getSettings();

        return {
            profileName: profile?.name ?? "",
            categories: CATEGORIES
                // A category declared before anything fills it would otherwise draw as a
                // heading over nothing.
                .filter(category => category.settings.length > 0)
                .map(category => ({
                    key: category.key,
                    title: t(`settings.categories.${category.wording}`),
                    collapsed: this.collapsed.has(category.key),
                    settings: category.settings.map(definition =>
                        this.describeSetting(definition, settings))
                }))
        };
    }
}

/**
 *  The languages on offer, with "follow the browser" first.
 *
 *  Each is named in itself - "Slovenčina", not "Slovak" - because a list of languages is read
 *  by somebody who does not read the one it is currently written in. "Follow the browser" is
 *  the exception: it is a sentence rather than a name, so it says which language that
 *  currently means, in the reader's own words.
 */
function languageOptions(): SettingOptionDTO[] {

    const guessed = SUPPORTED_LANGUAGES
        .find(language => language.code === baseLanguageOf(browserLanguageTag()));

    return [
        {
            value: AUTOMATIC_LANGUAGE,
            // A browser set to a language this extension does not have falls back to English,
            // and the entry says so rather than naming a language nothing is written in.
            label: t("settings.language.automatic",
                { name: guessed?.nativeName ?? SUPPORTED_LANGUAGES[0].nativeName })
        },
        ...SUPPORTED_LANGUAGES.map(language => ({
            value: language.code,
            label: language.nativeName
        }))
    ];
}

/** The answers a choice setting offers. */
function choiceOptionsOf(key: ChoiceSettingKey): SettingOptionDTO[] {
    switch (key) {
        case "language":
            return languageOptions();
        case "searchEngine":
            // The browser's own engine first, as the store requires and as the way back.
            return SEARCH_ENGINES.map(engineDTO)
                .map(engine => ({ value: engine.id, label: engine.label }));
        case "theme":
            return THEMES.map(theme => ({ value: theme, label: t(`settings.theme.options.${theme}`) }));
        case "themeStyle":
            return THEME_STYLES.map(style =>
                ({ value: style, label: t(`settings.themeStyle.options.${style}`) }));
        default:
            return dateFormatOptions();
    }
}

/** The date formats on offer, each shown writing the same day, so they can be compared. */
function dateFormatOptions(): SettingOptionDTO[] {
    return DATE_FORMATS.map((format: DateFormatId) => ({
        value: format,
        label: t(`dates.formats.${format}`, { sample: sampleOf(format) })
    }));
}
