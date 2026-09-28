import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { ProfileSettings } from "../backend/entity/ProfileSettings";
import {
    DevicePreferencesRepository, devicePreferencesRepository,
    MAX_SCALE, MIN_SCALE, SCALE_STEP
} from "../backend/repository/DevicePreferencesRepository";

import {
    DATE_FORMATS, DateFormatId, sampleOf
} from "../i18n/dates";
import { t } from "../i18n/i18n";
import { SEARCH_ENGINES } from "../backend/entity/SearchEngines";
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
export interface ToggleSettingDTO extends SettingCommonDTO {
    kind: "toggle";
    /** Which setting this is; what `toggle` is called with. */
    key: keyof ProfileSettings;
    enabled: boolean;
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

/** One setting, as the dialog draws it. */
export type SettingDTO = ToggleSettingDTO | RangeSettingDTO | ChoiceSettingDTO;

/** The settings that are numbers. One so far. */
export type RangeSettingKey = "uiScale";

/** The settings that are a choice out of a list. */
export type ChoiceSettingKey = "language" | "dateFormat" | "searchEngine";

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
    | { kind: "toggle"; key: keyof ProfileSettings; wording: string }
    | { kind: "range"; key: RangeSettingKey; wording: string }
    | { kind: "choice"; key: ChoiceSettingKey; wording: string };

/** A category, and what is in it. */
interface CategoryDefinition {
    key: string;
    /** Key under `settings.categories` holding what this section is called. */
    wording: string;
    settings: SettingDefinition[];
}

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
            { kind: "range", key: "uiScale", wording: "uiScale" }
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

    /** Categories the user has folded away; the first one starts out of it. */
    private readonly collapsed: Set<string> = new Set(
        CATEGORIES.map(category => category.key).filter(key => key !== FIRST_CATEGORY));

    public readonly observables = {
        settings: new ObservableValue<SettingsDTO>({ profileName: "", categories: [] })
    };

    /**
     *  @param profiles the profile registry; the singleton in normal use
     */
    /**
     *  @param profiles          the profile registry; the singleton in normal use
     *  @param devicePreferences what this browser prefers, which the profile has no say in
     */
    constructor(
        profiles: ProfileRepository = profileRepository,
        devicePreferences: DevicePreferencesRepository = devicePreferencesRepository
    ) {
        this.profiles = profiles;
        this.devicePreferences = devicePreferences;
    }

    /** Loads the active profile's settings into the observable. */
    public refresh(): void {
        this.observables.settings.set(this.describe());
    }

    /**
     *  Turns one setting on or off and redraws.
     *
     *  @param key     which setting
     *  @param enabled what to set it to
     */
    public async toggle(key: keyof ProfileSettings, enabled: boolean): Promise<void> {
        this.LOG.debug("toggle", `${key} -> ${enabled}`);
        await this.profiles.updateSettings({ [key]: enabled });
        this.refresh();
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

        await this.devicePreferences.setDateFormat(value);
        this.refresh();
        return false;
    }

    /**
     *  Folds a category away, or unfolds it, and redraws.
     *
     *  @param key which category
     */
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
                enabled: settings[definition.key],
                disabledReason: null
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
