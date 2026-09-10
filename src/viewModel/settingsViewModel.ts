import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { ProfileSettings } from "../backend/entity/ProfileSettings";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** One setting, as the dialog draws it. */
export interface SettingDTO {

    /** Which setting this is; what `toggle` is called with. */
    key: keyof ProfileSettings;

    /** What it is called in the dialog. */
    title: string;

    /** What turning it on does, in a sentence. */
    explanation: string;

    /** Whether it is on right now. */
    enabled: boolean;

    /**
     *  Why it cannot be changed at the moment, or null when it can.
     *
     *  There is one such reason coming already: TODOS.md has "open links in separate tabs"
     *  greying out a subgroup's "catch links into tab group", because the two contradict each
     *  other. Saying why beats a control that silently does nothing.
     */
    disabledReason: string | null;
}

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

/** What a setting is, and where it belongs, independent of what it is set to. */
interface SettingDefinition {
    key: keyof ProfileSettings;
    title: string;
    explanation: string;
}

/** A category, and what is in it. */
interface CategoryDefinition {
    key: string;
    title: string;
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
        title: "UI and behavior",
        settings: [
            {
                key: "enableDragAndDrop",
                title: "Enable drag & drop",
                explanation:
                    "Rearrange links, groups and subgroups by dragging them. Not built yet; "
                    + "turning this on now only stores the choice."
            },
            {
                key: "hideTips",
                title: "Hide tips",
                explanation:
                    "Stop showing the tips along the bottom of the page. This is where they "
                    + "come back from."
            }
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

    /** Categories the user has folded away; the first one starts out of it. */
    private readonly collapsed: Set<string> = new Set(
        CATEGORIES.map(category => category.key).filter(key => key !== FIRST_CATEGORY));

    public readonly observables = {
        settings: new ObservableValue<SettingsDTO>({ profileName: "", categories: [] })
    };

    /**
     *  @param profiles the profile registry; the singleton in normal use
     */
    constructor(profiles: ProfileRepository = profileRepository) {
        this.profiles = profiles;
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
                    title: category.title,
                    collapsed: this.collapsed.has(category.key),
                    settings: category.settings.map(definition => ({
                        key: definition.key,
                        title: definition.title,
                        explanation: definition.explanation,
                        enabled: settings[definition.key],
                        disabledReason: null
                    }))
                }))
        };
    }
}
