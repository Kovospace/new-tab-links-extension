import { ProfileMeta } from "../entity/AppStateEntity";
import { ProfileSettings, settingsOf } from "../entity/ProfileSettings";
import deepEqual from "fast-deep-equal";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ObservableValue } from "../../utils/observableValue";
import { DEFAULT_PROFILE_ID } from "../datasource/init/AppStateInit";
import { uid } from "./AppStateRepositoryUtils";
import { isStorableName } from "../sync/SyncContracts";
import { Logger } from "../../utils/logger";
import { PROFILE_REGISTRY_KEY } from "../datasource/chromeStorage/storageKeys";

export interface ProfileRegistry {
    activeProfileId: string;
    profiles: Record<string, ProfileMeta>;
}

export class ProfileRepository {

    private LOG!: Logger;
    private datasource = new ChromeStorageWrapper();
    private registry!: ProfileRegistry;

    readonly profiles$ = new ObservableValue<ProfileMeta[]>([]);

    public async init(): Promise<void> {
        this.LOG = new Logger("ProfileRepository");
        const saved = await this.datasource.get<ProfileRegistry>(PROFILE_REGISTRY_KEY);

        if (saved) {
            this.registry = saved;
            await this.repairRegistryIfUnusable();
        } else {
            // First run — seed registry with the default profile
            this.registry = this.seededRegistry();
            await this.saveRegistry();
        }
        this.profiles$.set(Object.values(this.registry.profiles));
    }

    /**
     * Puts a profile back only when there is genuinely not one left, and points the active
     * profile at something that exists.
     *
     * This used to re-add the seeded "default" profile whenever it was absent, which read as
     * harmless and was not. Synchronisation deliberately removes that profile: the literal
     * string "default" is not a UUID and the backend cannot store it, so the profile is
     * renamed to a real identifier once and the old entry dropped. Re-adding it here meant
     * every start produced an empty profile the user never made, which synchronisation then
     * gave a storable identifier and pushed — one junk profile named "Default" on
     * the account per new tab page opened. Those duplicates are what made a second device
     * merge against the wrong profile and delete the real one.
     */
    private async repairRegistryIfUnusable(): Promise<void> {

        if (Object.keys(this.registry.profiles).length === 0) {
            this.LOG.debug("repairRegistryIfUnusable", "Registry holds no profiles; reseeding");
            this.registry = this.seededRegistry();
            await this.saveRegistry();
            return;
        }

        if (!this.registry.profiles[this.registry.activeProfileId]) {
            const survivor = Object.keys(this.registry.profiles)[0];
            this.LOG.debug("repairRegistryIfUnusable",
                `Active profile is gone; falling back to ${survivor}`);
            this.registry = { ...this.registry, activeProfileId: survivor };
            await this.saveRegistry();
        }
    }

    /** A registry holding nothing but the seeded default profile. */
    private seededRegistry(): ProfileRegistry {
        return {
            activeProfileId: DEFAULT_PROFILE_ID,
            profiles: {
                [DEFAULT_PROFILE_ID]: {
                    id: DEFAULT_PROFILE_ID,
                    name: "Default",
                    createdAt: 0
                }
            }
        };
    }

    public getActiveProfileId(): string {
        return this.registry.activeProfileId;
    }

    public async setActiveProfile(id: string): Promise<void> {
        if (!this.registry.profiles[id]) {
            this.LOG.debug("setActiveProfile", `Profile ${id} not found in registry`);
            return;
        }
        this.registry = { ...this.registry, activeProfileId: id };
        await this.saveRegistry();
        // profiles$ content unchanged — only active flag, handled by AppStateRepository.state$
    }

    /**
     * Creates a profile, or refuses to when its name could not be stored.
     *
     * The check is here rather than only in the callers because this is the one door every
     * new profile comes through - the profiles menu, an import, and anything added later.
     * A name the account cannot take does not merely fail to reach it: an over-long one fails
     * the entire push with a 400, so it would sit in local state stopping every other change
     * from syncing until someone found it. It is easier to never let it in.
     *
     * @param name the name to give the profile; surrounding whitespace is dropped
     * @return the profile, or null when the name was not storable
     */
    public async createProfile(name: string): Promise<ProfileMeta | null> {
        if (!isStorableName(name)) {
            this.LOG.debug("createProfile", `Refusing unstorable profile name of length ${name.trim().length}`);
            return null;
        }

        const id = uid();
        const meta: ProfileMeta = { id, name: name.trim(), createdAt: Date.now() };
        this.registry = {
            ...this.registry,
            profiles: { ...this.registry.profiles, [id]: meta }
        };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
        return meta;
    }

    /**
     * Gives a profile a different name, leaving everything else about it alone.
     *
     * The identifier is deliberately untouched. It is what the account, the baseline and every
     * other device key the profile by, so renaming has to be a name change and nothing else -
     * a new identifier would read to synchronisation as a deletion and a creation, and would
     * take the profile's data with it.
     *
     * Firing profiles$ is what tells synchronisation there is something to push; the change
     * set turns the differing name into an upsert of the same row.
     *
     * @param id   the profile to rename
     * @param name the new name, already trimmed and checked by the caller
     */
    public async renameProfile(id: string, name: string): Promise<void> {
        const existing = this.registry.profiles[id];
        if (!existing) {
            this.LOG.debug("renameProfile", `Profile ${id} not found in registry`);
            return;
        }
        // The caller checks too, because it is the one that can say why to the user. This is
        // the backstop that makes the rule hold whoever calls.
        if (!isStorableName(name)) {
            this.LOG.debug("renameProfile", `Refusing unstorable profile name of length ${name.trim().length}`);
            return;
        }
        if (existing.name === name) return;

        this.registry = {
            ...this.registry,
            profiles: { ...this.registry.profiles, [id]: { ...existing, name } }
        };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
    }

    /**
     * What a profile is set to do, with anything unsaid filled in with its default.
     *
     * @param id the profile to read; the active one when not given
     */
    public getSettings(id: string = this.registry.activeProfileId): ProfileSettings {
        return settingsOf(this.registry.profiles[id]);
    }

    /**
     * Changes some of a profile's settings, leaving the rest of it alone.
     *
     * Firing profiles$ is what tells synchronisation there is something to push, exactly as
     * renaming does: the change set turns the differing settings into an upsert of the same
     * profile row. That is the whole reason settings live on the profile record - nothing had
     * to be taught about them but the two ends of the wire.
     *
     * @param changes the settings to change; anything not named is left as it was
     * @param id      the profile to change; the active one when not given
     */
    public async updateSettings(
        changes: Partial<ProfileSettings>,
        id: string = this.registry.activeProfileId
    ): Promise<void> {

        const existing = this.registry.profiles[id];
        if (!existing) {
            this.LOG.debug("updateSettings", `Profile ${id} not found in registry`);
            return;
        }

        const settings: ProfileSettings = { ...settingsOf(existing), ...changes };
        if (deepEqual(settings, settingsOf(existing))) {
            // Nothing moved. Saying so anyway would fire profiles$ and push an operation
            // identical to the row the account already holds. Compared as a whole rather
            // than field by field, so a setting added later is covered without this being
            // remembered.
            return;
        }

        this.registry = {
            ...this.registry,
            profiles: { ...this.registry.profiles, [id]: { ...existing, settings } }
        };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
    }

    public async deleteProfile(id: string): Promise<void> {
        if (id === DEFAULT_PROFILE_ID) {
            this.LOG.debug("deleteProfile", "Cannot delete the default profile");
            return;
        }
        const profiles = { ...this.registry.profiles };
        delete profiles[id];
        this.registry = { ...this.registry, profiles };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
    }

    /** Every profile this device knows about, in registry order. */
    public getProfiles(): ProfileMeta[] {
        return Object.values(this.registry.profiles);
    }

    /**
     * Adds a profile, or updates one, under an identifier chosen elsewhere.
     *
     * createProfile() mints its own identifier, which is right when the user creates a
     * profile here but wrong for one that already exists on the account: that one has to keep
     * the identifier every other device knows it by.
     */
    public async upsertProfile(meta: ProfileMeta): Promise<void> {
        this.registry = {
            ...this.registry,
            profiles: { ...this.registry.profiles, [meta.id]: meta }
        };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
    }

    /**
     * Removes a profile whatever its identifier, including the seeded default one.
     *
     * deleteProfile() refuses the seeded profile on the grounds that a user clicking delete
     * would otherwise be left with none. That guard is in the wrong place: it protects an
     * identifier rather than the invariant, and the identifier it protects is exactly the one
     * a stray profile carries. This method protects nothing, and its callers hold the
     * invariant themselves - synchronisation removes a profile only when the account no
     * longer has it or when a replacement has just been created under the identifier the
     * account uses, and the profile manager never offers the active profile for deletion, so
     * one always survives.
     */
    public async removeProfile(id: string): Promise<void> {
        const profiles = { ...this.registry.profiles };
        delete profiles[id];

        this.registry = {
            ...this.registry,
            profiles,
            activeProfileId: this.registry.activeProfileId === id
                ? Object.keys(profiles)[0] ?? this.registry.activeProfileId
                : this.registry.activeProfileId
        };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
    }

    private async saveRegistry(): Promise<void> {
        await this.datasource.save(PROFILE_REGISTRY_KEY, this.registry);
    }
}

export const profileRepository = new ProfileRepository();