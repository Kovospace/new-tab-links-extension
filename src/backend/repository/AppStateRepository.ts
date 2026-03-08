import {AppState, Environment, Group, Link, GroupItem, Subgroup} from "../entity/AppStateEntity";
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

    // GET actions
    getCurrentEnvironmentId(): string | null {
        if (Object.keys(this.state.environments).length <= 0) {
            this.LOG.debug("getCurrentEnvironmentId", "no environments in state");
            this.state.activeEnvironmentId = null;
            return null;
        }
        if (!this.state.activeEnvironmentId || !this.checkEnvironmentExists(this.state.activeEnvironmentId)) {
            this.LOG.debug("getCurrentEnvironmentId", "setting first available env as current");
            this.state.activeEnvironmentId = Object.keys(this.state.environments)[0];
        }
        this.LOG.debug(
            "getCurrentEnvironmentId",
            `${this.state.activeEnvironmentId} used as current environment`);
        return this.state.activeEnvironmentId;
    }

    getCurrentEnvironment(): Environment | null {
        return this.getCurrentEnvironmentId() ? this.state.environments[this.state.activeEnvironmentId] : null;
    }

    getGroups(workspaceId: string) {
        return Object
            .values(this.state.groups)
            .filter((group: Group) => group.environmentId === workspaceId);
    }

    // Workspace operations

    /**
     *  Create new workspace
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

    /**
     *  Set given workspace as current
     */
    setWorkspaceDefault(id: string): Promise<AppState> {
        this.state = {
            ...this.state,
            activeEnvironmentId: id
        };
        return this.save();
    }

    /**
     *  Change workspace title and description
     */
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

    /**
     *  Delete workspace including everything that is associated with it
     */
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
            // set other not deleted environment ID as current
            this.state.activeEnvironmentId = this.getCurrentEnvironmentId();
        }
        // remove groups (&& cascading actions to subGroups and links)
        Object
            .values(this.state.groups)
            .filter(group => group.environmentId === id)
            .forEach(group => this.deleteGroup(group.id));
        // save change
        return this.save();
    }

    // Group operations

    /**
     *  Create group in given workspace or in current workspace if parameter omitted
     */
    createGroup(title: string, environmentId: string): Promise<void> {
        const id = uid();
        if (!environmentId) {
            environmentId = this.getCurrentEnvironmentId();
        }
        this.state = {
            ...this.state,
            groups: {
                ...this.state.groups,
                [id]: {
                    id: id,
                    environmentId: environmentId,
                    title: title,
                    // description: "",
                    createdAt: Date.now()
                } satisfies Group
            }
        };
        return this.save();
    }

    /**
     *  Change group title and description
     */
    renameGroup(id: string, title: string, description: string): Promise<void> {
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

    /**
     *  Deletes the whole group, links and subgroups associated with it
     */
    deleteGroup(id: string): Promise<void> {
        // delete group
        const groups = { ...this.state.groups };
        delete groups[id];
        this.state = {
            ...this.state,
            groups
        };
        // delete all links in group that are not in subgroup
        Object
            .values(this.state.links)
            .filter(link => link.groupId === id && !link.subGroupId)
            .forEach(link => this.deleteLink(link.id));
        // delete all subgroups in group (&& cascading actions for its links)
        Object
            .values(this.state.subgroups)
            .filter(subgroup => subgroup.groupId === id)
            .forEach(subgroup => this.deleteSubGroup(subgroup.id));
        return this.save();
    }

    // Subgroup operations

    //TODO assign position to new subgroup
    /**
     *  Deletes the whole sub-groups and its links
     */
    createSubGroup(
        title: string,
        description: string,
        groupId: string,
        environmentId: string | null = this.getCurrentEnvironmentId()
    ): Promise<AppState> {
        const id = uid();
        this.state = {
            ...this.state,
            subgroups: {
                ...this.state.subgroups,
                [id]: {
                    id: id,
                    groupId: groupId,
                    environmentId: environmentId!,
                    title: title,
                    description: description,
                    createdAt: Date.now(),
                    type: "subgroup",
                    collapsed: true,
                    defaultCollapsed: true,
                    position: 0
                } satisfies Subgroup
            }
        };
        return this.save();
    }

    deleteSubGroup(id: string): Promise<void> {
        // delete subgroup
        const subGroups = { ...this.state.subgroups };
        delete subGroups[id];
        this.state = {
            ...this.state,
            subGroups
        };
        // delete links
        Object
            .values(this.state.links)
            .filter(link => link.subGroupId === id)
            .forEach(link => this.deleteLink(link.id));
        return this.save();
    }

    /**
     *  Delete subgroup but move links to "root" level of group
     */
    ceaseSubgroup(id: string) {

    }

    // Link operations

    /**
     *  Create new link for given group (and sub-group if selected) in current workspace
     */
    createLink(groupId: string, subGroupId: string, title: string, url: string): Promise<void> {

        this.LOG.debug(
            "createLink",
            `groupId: ${groupId}, subGroupId: ${subGroupId}, title: ${title}, url: ${url}`);

        const id: string = uid();
        const nextPosition: number = this.getPositionForNewLink(groupId, subGroupId);

        this.state = {
            ...this.state,
            links: {
                ...this.state.links,
                [id]: {
                    id: id,
                    title: title,
                    url: url,
                    environmentId: this.getCurrentEnvironmentId(),
                    groupId: groupId,
                    subGroupId: subGroupId,
                    type: "link",
                    createdAt: Date.now(),
                    position: nextPosition
                } satisfies Link
            }
        };

        return this.save();
    }

    /**
     *  Edit any non-readonly property of link
     */
    editLink(id: string, subGroupId: string, groupId: string, workspaceId: string,
             title: string, url: string, position: number
    ) {

        this.LOG.debug(
            "editLink",
            `workspaceId: ${workspaceId}, groupId: ${groupId}, subGroupId: ${subGroupId}, 
            id: ${id}, title: ${title}, url: ${url}, position: ${position}`);

        let linksToEdit: Record<string, Link> = {
            [id]: this.state.links[id]
        };

        if (position !== undefined && position !== null && linksToEdit[id].position !== position) {
            linksToEdit = this.getRepositionedLinks(
                id, linksToEdit[id].position, position, groupId, subGroupId);
        }

        linksToEdit[id] = {
            ...linksToEdit[id],
            title: title,
            url: url,
            environmentId: workspaceId,
            groupId: groupId,
            subGroupId: subGroupId
        } satisfies Link;

        this.state = {
            ...this.state,
            links: {
                ...this.state.links,
                ...linksToEdit
            }
        };

        return this.save();
    }

    /**
     *  Delete given link by its ID
     */
    deleteLink(id: string): Promise<void> {
        const links = { ...this.state.links };
        delete links[id];
        this.state = {
            ...this.state,
            links
        };
        return this.save();
    }



    //TODO ako sa bude chovat pri 0 linkoch
    private getPositionForNewLink(groupId: string, subGroupId: string | null | undefined): number {
        return Math.max(...Object.values(this.state.links)
            .filter(link => {
                if (subGroupId !== undefined && subGroupId !== null && subGroupId !== "") {
                    return link.subGroupId === subGroupId
                }
                return link.groupId === groupId;
            })
            .map(link => link.position)
            .filter(position => position !== undefined)) + 1;
    }

    private getRepositionedLinks(
        currentLinkId: string, currentPosition: number, newPosition: number,
        groupId: string, subGroupId: string | null | undefined
    ): Record<string, Link> {

        const updatedLinks: Record<string, Link> = {};

        Object
            .entries(this.state.links)
            .filter(([_, link]) => {
                if (subGroupId) {
                    return link.subGroupId === subGroupId
                }
                return link.groupId === groupId;
            })
            .forEach(([id, link]) => {
                // presúvaný link
                if (id === currentLinkId) {
                    updatedLinks[id] = {
                        ...link,
                        position: newPosition
                    };
                    return;
                }
                let updatedPosition = link.position;
                // presun nahor (napr. z 5 → 2)
                if (
                    newPosition < currentPosition &&
                    link.position >= newPosition &&
                    link.position < currentPosition
                ) {
                    updatedPosition = link.position + 1;
                }
                // presun nadol (napr. z 2 → 5)
                if (
                    newPosition > currentPosition &&
                    link.position <= newPosition &&
                    link.position > currentPosition
                ) {
                    updatedPosition = link.position - 1;
                }
                updatedLinks[id] = {
                    ...link,
                    position: updatedPosition
                };
            });

        return updatedLinks;
    }
}

export const appStateRepository = new AppStateRepository();
