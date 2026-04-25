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
            // Ensure the default profile always exists in the registry
            if (!this.registry.profiles[DEFAULT_PROFILE_ID]) {
                this.registry.profiles[DEFAULT_PROFILE_ID] = {
                    id: DEFAULT_PROFILE_ID,
                    name: "Default",
                    createdAt: 0
                };
                await this.saveRegistry();
            }
        } else {
            // First run — seed registry with the default profile
            this.registry = {
                activeProfileId: DEFAULT_PROFILE_ID,
                profiles: {
                    [DEFAULT_PROFILE_ID]: {
                        id: DEFAULT_PROFILE_ID,
                        name: "Default",
                        createdAt: 0
                    }
                }
            };
            await this.saveRegistry();
        }
        this.profiles$.set(Object.values(this.registry.profiles));
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

    private async saveRegistry(): Promise<void> {
        await this.datasource.save(PROFILE_REGISTRY_KEY, this.registry);
    }
}

export const profileRepository = new ProfileRepository();