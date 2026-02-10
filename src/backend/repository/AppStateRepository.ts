import {AppState, Environment, Group, Link} from "../entity/AppStateEntity";
import {uid} from "../../utils/firstOrderMethods";
import {ChromeStorageWrapper} from "../datasource/chromeStorage/chromeStorageWrapper";
// import {AppStateRepositoryUtils} from "./AppStateRepositoryUtils";
import {ObservableValue} from "../../utils/observableValue";
import {appStateInit} from "../datasource/init/AppStateInit";

const STORAGE_KEY = "workspace_state";

export class AppStateRepository {

    private state!: AppState;
    readonly state$ = new ObservableValue<AppState>(appStateInit);
    private datasource = new ChromeStorageWrapper()
    //private repositoryUtils!: AppStateRepositoryUtils;

    public async init(initialState: AppState) {
        const saved = await this.datasource.get<AppState>(STORAGE_KEY);
        // console.log("AppStateRepository - init(): saved state: " + saved)
        this.state = saved ?? initialState;
        this.state$.set(this.state);
        return this.save();
    }

    private async save(): Promise<AppState> {
        // console.log("AppStateRepository - save(): this.state before datasource save: " + Object.values(this.state.groups).length);
        // console.log("AppStateRepository - save(): this.$state.get() before datasource save: " + Object.values(this.state$.get().groups).length);
        await this.datasource.save(STORAGE_KEY, this.state);
        // console.log("AppStateRepository - save(): this.state after datasource save: " + Object.values(this.state.groups).length);
        // console.log("AppStateRepository - save(): this.$state.get() after datasource save: " + Object.values(this.state$.get().groups).length);
        this.state$.set(this.state);
        // console.log("AppStateRepository - save(): this.state after state set: " + Object.values(this.state.groups).length);
        // console.log("AppStateRepository - save(): this.$state.get() after state set: " + Object.values(this.state$.get().groups).length);
        return this.state;
    }

    // public getCurrentEnvironment(): Environment {
    //     const environmentId: string = this.state.activeEnvironmentId;
    //     if (!environmentId) throw new Error(
    //         "Environment ID does not exists in AppState data model");
    //     const environment: Environment = this.state.environments[environmentId];
    //     if (!environment) throw new Error(
    //         "Environment with ID " + environmentId + " does not exists in app state");
    //     return environment;
    // }
    //
    // public getGroup(groupId: string): Group {
    //     const group = this.state.groups[groupId];
    //     if (!group) throw new Error(
    //         "Group with group ID " + groupId + " does not exists in AppState data model");
    //     return group;
    // }
    //
    // public getLink(linkId: string) {
    //     const link: Link = this.state.links[linkId];
    //     if (!link) throw new Error(
    //         "Link with link ID " + linkId + " does not exists in AppState data model");
    //     return link;
    // }

    getGroups(workspaceId: string) {
        return Object
            .values(this.state.groups)
            .filter((group: Group) => group.environmentId === workspaceId);
    }

    /* ================== CRUD ================== */

    addWorkspace(title: string): Promise<AppState> {
        const id = uid();
        this.state = {
            ...this.state,
            activeEnvironmentId: id,
            environments: {
                ...this.state.environments,
                [id]: {
                    id: id,
                    name: title,
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

    renameWorkspace(id: string, newTitle: string) {
        this.state = {
            ...this.state,
            environments: {
                ...this.state.environments,
                [id]: {
                    ...this.state.environments[id],
                    name: title,
                } satisfies Environment
            }
        };
    }

    deleteWorksapce(id: string) {

    }

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

    renameGroup(groupId: string, title: string): Promise<void> {
        const group = this.getGroup(groupId);
        group.title = title;
        return this.save();
    }

    deleteGroup(groupId: string): Promise<void> {
        this.getGroup(groupId);
        delete this.state.groups[groupId];
        return this.save();
    }

    createLink(groupId: string, subGroupId: string, title: string, url: string): Promise<void> {
        this.getGroup(groupId);
        const id = uid();
        this.state.links[id] = {
            id: id,
            title: title,
            url: url,
            environmentId: this.state.activeEnvironmentId,
            groupId: groupId,
            subGroupId: subGroupId
        };
        return this.save();
    }

    deleteLink(id: string): Promise<void> {
        this.getLink(id);
        delete this.state.links[id];
        return this.save();
    }
}

export const appStateDAO = new AppStateRepository();
