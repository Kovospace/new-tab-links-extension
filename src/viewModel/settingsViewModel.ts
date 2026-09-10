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

/** The settings screen: which profile it is about, and what is on it. */
export interface SettingsDTO {
    profileName: string;
    settings: SettingDTO[];
}

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
 */
export class SettingsViewModel {

    private LOG: Logger = new Logger("SettingsViewModel");

    private readonly profiles: ProfileRepository;

    public readonly observables = {
        settings: new ObservableValue<SettingsDTO>({ profileName: "", settings: [] })
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

    /** The active profile's settings, worded for the dialog. */
    private describe(): SettingsDTO {

        const activeId = this.profiles.getActiveProfileId();
        const profile = this.profiles.getProfiles().find(one => one.id === activeId);
        const settings = this.profiles.getSettings();

        return {
            profileName: profile?.name ?? "",
            settings: [
                {
                    key: "enableDragAndDrop",
                    title: "Enable drag & drop",
                    explanation:
                        "Rearrange links, groups and subgroups by dragging them. Not built "
                        + "yet; turning this on now only stores the choice.",
                    enabled: settings.enableDragAndDrop,
                    disabledReason: null
                }
            ]
        };
    }
}
