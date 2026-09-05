import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileMeta } from "../backend/entity/AppStateEntity";
import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** One row of the profile manager. */
export interface ManagedProfileDTO {

    id: string;
    name: string;

    /** The profile currently loaded. It is never offered for deletion; see the view model. */
    active: boolean;

    /** What the profile holds, already worded — the template shows this text as it stands. */
    contentsLabel: string;

    /** True when the profile holds nothing at all, which is what a stray one looks like. */
    empty: boolean;
}

/**
 *  View model behind the profile manager.
 *
 *  It does not extend AbstractViewModel, for the same reason SyncAccountViewModel does not: that
 *  base class maps AppState onto a component's DTO, and profiles are the registry rather than
 *  the state — the list is the same whichever profile happens to be loaded.
 *
 *  **The active profile is never deletable.** Removing the profile a user is looking at would
 *  leave the application with no state to render and the registry pointing at nothing, and the
 *  recovery for that — reseeding a profile nobody asked for — is exactly the behaviour that
 *  produced a pile of stray "Default" profiles in the first place. Switching first costs one
 *  click and makes the whole class of problem unreachable.
 */
export class ProfileManagerViewModel {

    private LOG: Logger = new Logger("ProfileManagerViewModel");

    private readonly profiles: ProfileRepository;
    private readonly appState: AppStateRepository;

    public readonly observables = {
        profiles: new ObservableValue<ManagedProfileDTO[]>([])
    };

    /**
     *  @param profiles the profile registry; the singleton in normal use
     *  @param appState where each profile's data is stored; the singleton in normal use
     */
    constructor(
        profiles: ProfileRepository = profileRepository,
        appState: AppStateRepository = appStateRepository
    ) {
        this.profiles = profiles;
        this.appState = appState;
    }

    /**
     *  Loads the list and keeps it current.
     *
     *  Counting what each profile holds means reading each one out of storage, so the list is
     *  rebuilt on demand rather than recomputed on every registry change.
     */
    public async refresh(): Promise<void> {
        const activeProfileId = this.appState.getActiveProfileId();

        const rows = await Promise.all(
            this.profiles.getProfiles().map(profile => this.describe(profile, activeProfileId)));

        this.observables.profiles.set(rows);
    }

    /**
     *  Deletes one profile and everything stored under it.
     *
     *  Synchronisation notices by itself: removing a profile fires the registry's observable,
     *  which is what schedules the push that tells the account.
     *
     *  @param profileId the profile to remove
     *  @return true when it was removed
     */
    public async deleteProfile(profileId: string): Promise<boolean> {
        if (profileId === this.appState.getActiveProfileId()) {
            this.LOG.debug("deleteProfile", "Refusing to delete the profile being displayed");
            return false;
        }

        await this.profiles.removeProfile(profileId);
        await this.appState.discardProfileData(profileId);
        this.LOG.log("deleteProfile", `Deleted profile ${profileId}`);

        await this.refresh();
        return true;
    }

    /**
     *  Deletes every profile except the one being displayed.
     *
     *  Not every profile, despite what a user reaching for this is likely to mean: there is no
     *  such thing as no profiles, so one has to survive, and the only one that can survive
     *  without the application changing what it is showing is the active one. The dialog says
     *  so before it asks.
     *
     *  @return how many were deleted
     */
    public async deleteEveryOtherProfile(): Promise<number> {
        const activeProfileId = this.appState.getActiveProfileId();
        const doomed = this.profiles.getProfiles()
            .filter(profile => profile.id !== activeProfileId);

        for (const profile of doomed) {
            await this.profiles.removeProfile(profile.id);
            await this.appState.discardProfileData(profile.id);
        }
        this.LOG.log("deleteEveryOtherProfile", `Deleted ${doomed.length} profile(s)`);

        await this.refresh();
        return doomed.length;
    }

    /** How many profiles could be deleted right now, which is all of them but the active one. */
    public countDeletable(): number {
        return Math.max(this.observables.profiles.get().length - 1, 0);
    }

    /**
     *  Turns one profile into the row the dialog renders.
     *
     *  The counts are the point of this screen rather than decoration. An account that
     *  collected stray profiles has several of the same name, and what distinguishes the real
     *  one from the rest is that it holds something.
     *
     *  @param profile         the profile to describe
     *  @param activeProfileId the profile currently loaded
     *  @return the row
     */
    private async describe(
        profile: ProfileMeta,
        activeProfileId: string
    ): Promise<ManagedProfileDTO> {

        // The active profile's most recent state is in memory; reading it back from storage
        // would miss whatever has not settled yet.
        const data = profile.id === activeProfileId
            ? this.appState.state$.get()
            : await this.appState.readProfileData(profile.id);

        const workspaces = Object.keys(data?.environments ?? {}).length;
        const links = Object.keys(data?.links ?? {}).length;

        return {
            id: profile.id,
            name: profile.name,
            active: profile.id === activeProfileId,
            empty: workspaces === 0 && links === 0,
            contentsLabel: workspaces === 0 && links === 0
                ? "empty"
                : `${workspaces} ${workspaces === 1 ? "workspace" : "workspaces"}`
                    + `, ${links} ${links === 1 ? "link" : "links"}`
        };
    }
}
