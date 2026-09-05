import { ProfileMeta } from "../entity/AppStateEntity";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { ObservableValue } from "../../utils/observableValue";
import { DEFAULT_PROFILE_ID } from "../datasource/init/AppStateInit";
import { uid } from "./AppStateRepositoryUtils";
import { Logger } from "../../utils/logger";

const PROFILE_REGISTRY_KEY = "profile_registry";

interface ProfileRegistry {
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

    public async createProfile(name: string): Promise<ProfileMeta> {
        const id = uid();
        const meta: ProfileMeta = { id, name, createdAt: Date.now() };
        this.registry = {
            ...this.registry,
            profiles: { ...this.registry.profiles, [id]: meta }
        };
        await this.saveRegistry();
        this.profiles$.set(Object.values(this.registry.profiles));
        return meta;
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