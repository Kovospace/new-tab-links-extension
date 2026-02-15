import {AppState, Environment, Group, Link} from "../entity/AppStateEntity";
import {uid} from "../../utils/firstOrderMethods";
import {ChromeStorageWrapper} from "../datasource/chromeStorage/chromeStorageWrapper";
// import {AppStateRepositoryUtils} from "./AppStateRepositoryUtils";
import {ObservableValue} from "../../utils/observableValue";
import {appStateInit} from "../datasource/init/AppStateInit";
import {Logger} from "../../utils/logger"

const STORAGE_KEY = "workspace_state";

export class AppStateRepository {

    private LOG!: Logger

    private state!: AppState;
    //private initialState!: AppState;
    readonly state$ = new ObservableValue<AppState>(appStateInit);
    private datasource = new ChromeStorageWrapper()
    //private repositoryUtils!: AppStateRepositoryUtils;

    public async init(initialState: AppState) {
        this.LOG = new Logger("AppStateRepository");
        const saved = await this.datasource.get<AppState>(STORAGE_KEY);
        //this.initialState = initialState;
        this.state = saved ?? initialState;
        this.state$.set(this.state);
        return this.save();
    }

    private async save(): Promise<AppState> {
        await this.datasource.save(STORAGE_KEY, this.state);
        this.state$.set(this.state);
        return this.state;
    }

    private checkEnvironmentExists(id: string): boolean {
        return id in this.state.environments;
    }

    getCurrentEnvironment(): Environment {
        if (Object.keys(this.state.environments).length <= 0) {
            this.LOG.debug("getCurrentEnvironment", "no environments in state");
            this.state.activeEnvironmentId = null;
            return null;
        }
        if (!this.state.activeEnvironmentId) {
            this.LOG.debug("getCurrentWorkspace", "setting first available env as current");
            this.state.activeEnvironmentId = Object.keys(this.state.environments)[0];
        }
        const currentEnv: Environment = this.state.environments[this.state.activeEnvironmentId];
        this.LOG.debug(
            "getCurrentEnvironment",
            `selecting ${currentEnv.id} as current environment`);
        return currentEnv;
    }

    getGroups(workspaceId: string) {
        return Object
            .values(this.state.groups)
            .filter((group: Group) => group.environmentId === workspaceId);
    }

    /**
     *  Workspace operations
     */

    addWorkspace(title: string, description?: string): Promise<AppState> {
        const id = uid();
        this.state = {
            ...this.state,
            activeEnvironmentId: id,
            environments: {
                ...this.state.environments,
                [id]: {
                    id: id,
                    name: title,
                    description: description,
                    createdAt: Date.now(),
                    order: 0
                } satisfies Environment
            }
        };
        return this.save();
    }

    setWorkspaceDefault(id: string): Promise<AppState> {
        this.state = {
            ...this.state,
            activeEnvironmentId: id
        };
        return this.save();
    }

    renameWorkspace(id: string, title: string, description: string) {
        this.LOG.debug("renameWorkspace", `id: ${id}, title: ${title}, description: ${description}`);
        this.state = {
            ...this.state,
            environments: {
                ...this.state.environments,
                [id]: {
                    ...this.state.environments[id],
                    name: title,
                    description: description
                } satisfies Environment
            }
        };
        return this.save();
    }

    deleteWorksapce(id: string) {
        this.LOG.debug("deleteWorkspace", id);
        // remove env
        this.state = {
            ...this.state,
            environments: Object.fromEntries(
                Object
                    .entries(this.state.environments)
                    .filter(([key]) => key !== id)
            )
        };
        // post-remove env checks
        if (id === this.state.activeEnvironmentId) {
            this.state.activeEnvironmentId = this.getCurrentEnvironment();
        }
        // remove groups
        Object
            .values(this.state.groups)
            .filter(group => group.environmentId === id)
            .forEach(group => this.deleteGroup(group.id));
        // remove subgroups
        Object
            .values(this.state.subgroups)
            .filter(subgroup => subgroup.environmentId === id)
            .forEach(subgroup => this.deleteSubGroup(id));
        // remove links
        Object
            .values(this.state.links)
            .filter(link => link.environmentId === id)
            .forEach(link => this.deleteLink(link.id));
        // save change
        return this.save();
    }

    /**
     *  Group operations
     */

    createGroup(title: string, environmentId: string): Promise<void> {
        const id = uid();
        this.state = {
            ...this.state,
            groups: {
                ...this.state.groups,
                [id]: {
                    id,
                    environmentId,
                    title
                }
            }
        };
        return this.save();
    }

    renameGroup(id: string, title: string, description: string): Promise<void> {
      // console.log("----------------------------");
      // console.log(description);
        this.state = {
          ...this.state,
          groups: {
            ...this.state.groups,
            [id]: {
              ...this.state.groups[id],
              title: title,
              description: description
            }
          }
        };
        return this.save();
    }

    deleteGroup(groupId: string): Promise<void> {
        delete this.state.groups[groupId];
        return this.save();
    }

    /**
     *  Subgroup operations
     */

    deleteSubGroup(id: string): Promise<void> {
        delete this.state.subgroups[id];
        return this.save();
    }

    /**
     *  Link operations
     */

    createLink(groupId: string, subGroupId: string, title: string, url: string): Promise<void> {
        this.LOG.debug(
            "createLink",
            `groupId: ${groupId}, subGroupId: ${subGroupId}, title: ${title}, url: ${url}`);
        const id = uid();
        this.state = {
            ...this.state,
            links: {
                ...this.state.links,
                [id]: {
                    id: id,
                    title: title,
                    url: url,
                    environmentId: this.getCurrentEnvironment().id,
                    groupId: groupId,
                    subGroupId: subGroupId,
                    type: "link"
                } satisfies Link
            }
        };
        return this.save();
    }

    deleteLink(id: string): Promise<void> {
        delete this.state.links[id];
        return this.save();
    }
}

export const appStateRepository = new AppStateRepository();
