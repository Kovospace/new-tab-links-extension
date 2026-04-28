import {AppState, Environment, Group, Link, GroupItem, Subgroup, ProfileData} from "../entity/AppStateEntity";
import {ChromeStorageWrapper} from "../datasource/chromeStorage/chromeStorageWrapper";
import {uid} from "./AppStateRepositoryUtils";
import {ObservableValue} from "../../utils/observableValue";
import {appStateInit, emptyProfileData} from "../datasource/init/AppStateInit";
import {Logger} from "../../utils/logger"

const APP_STATE_PREFIX = "app_state_";

export class AppStateRepository {

    private LOG!: Logger

    private state!: AppState;
    //private initialState!: AppState;
    readonly state$ = new ObservableValue<AppState>(appStateInit);
    private datasource = new ChromeStorageWrapper()

    /**
     * @param initialState  Fallback state when no persisted data exists for the profile.
     * @param activeProfileId  Which profile to load; overrides initialState.activeProfileId
     *                         (supplied by ProfileRepository on startup).
     */
    public async init(initialState: AppState, activeProfileId?: string) {
        this.LOG = new Logger("AppStateRepository");
        const profileId = activeProfileId ?? initialState.activeProfileId;
        const profileKey = APP_STATE_PREFIX + profileId;
        const saved = await this.datasource.get<AppState>(profileKey);
        this.state = saved ?? { ...initialState, activeProfileId: profileId };
        this.state$.set(this.state);
        return this.save();
    }

    getActiveProfileId(): string {
        return this.state.activeProfileId;
    }

    /**
     * Overwrite the current profile's data in-place and fire state$.
     * Used when populating an empty profile (first-run import or load defaults).
     */
    public replaceCurrentProfileData(data: ProfileData): Promise<AppState> {
        this.state = {
            ...data,
            user: this.state.user,
            activeProfileId: this.state.activeProfileId
        };
        return this.save();
    }

    /**
     * Persist ProfileData under a given profile key without switching the active profile.
     * Used when importing a profile — data is saved but the current session is unaffected
     * until an explicit switchProfile() call.
     */
    public async saveProfileData(profileId: string, data: ProfileData): Promise<void> {
        const fullState: AppState = {
            ...data,
            user: this.state.user,
            activeProfileId: profileId
        };
        await this.datasource.save(APP_STATE_PREFIX + profileId, fullState);
    }

    /**
     * Replace the entire loaded profile with another one.
     * Loads saved data for that profile from storage (or starts empty),
     * then fires state$ so all subscribers re-render.
     */
    public async switchProfile(profileId: string): Promise<AppState> {
        const profileKey = APP_STATE_PREFIX + profileId;
        const saved = await this.datasource.get<AppState>(profileKey);
        this.state = {
            ...(saved ?? emptyProfileData),
            user: this.state.user,
            activeProfileId: profileId
        };
        return this.save();
    }

    private async save(): Promise<AppState> {
        await this.datasource.save(APP_STATE_PREFIX + this.state.activeProfileId, this.state);
        this.state$.set(this.state);
        return this.state;
    }

    /** Persists state to storage without firing state$ — use when the UI updates itself directly. */
    private async saveQuiet(): Promise<void> {
        await this.datasource.save(APP_STATE_PREFIX + this.state.activeProfileId, this.state);
    }

    private checkEnvironmentExists(id: string): boolean {
        return id in this.state.environments;
    }

    // GET actions
    getCurrentEnvironmentId(): string | null {
        if (Object.keys(this.state.environments).length <= 0) {
            this.LOG.debug("getCurrentEnvironmentId", "no environments in state");
            //this.state.activeEnvironmentId = null;
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
        if (!this.state.activeEnvironmentId) {
            return null;
        }
        return this.getCurrentEnvironmentId() ? this.state.environments[this.state.activeEnvironmentId] : null;
    }

    getGroups(workspaceId: string) {
        return Object
            .values(this.state.groups)
            .filter((group: Group) => group.environmentId === workspaceId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
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
    renameWorkspace(id: string, title: string, description?: string) {
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
    createGroup(title: string, environmentId: string): Promise<AppState> {
        const id = uid();
        if (!environmentId) {
            // in that case it is not possible for environment to not exists
            environmentId = this.getCurrentEnvironmentId()!;
        }
        this.state = {
            ...this.state,
            groups: {
                ...this.state.groups,
                [id]: {
                    id: id,
                    environmentId: environmentId,
                    title: title,
                    createdAt: Date.now(),
                    order: this.getOrderForNewGroup(environmentId)
                } satisfies Group
            }
        };
        return this.save();
    }

    /**
     *  Change group title and description
     */
    renameGroup(id: string, title: string, description: string): Promise<AppState> {
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
    deleteGroup(id: string): Promise<AppState> {
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
        groupId: string,
        environmentId: string | null = this.getCurrentEnvironmentId(),
        title: string,
        description?: string
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
                    //TODO
                    position: 0
                } satisfies Subgroup
            }
        };
        return this.save();
    }

    toggleSubgroupCollapsed(id: string): void {
        const sg = this.state.subgroups[id];
        if (!sg) return;
        this.state = {
            ...this.state,
            subgroups: {
                ...this.state.subgroups,
                [id]: { ...sg, collapsed: !sg.collapsed }
            }
        };
        this.saveQuiet();
    }

    editSubGroup(id: string, title: string, description: string): Promise<AppState> {
        this.state = {
            ...this.state,
            subgroups: {
                ...this.state.subgroups,
                [id]: {
                    ...this.state.subgroups[id],
                    title: title,
                    description: description
                }
            }
        };
        return this.save();
    }

    deleteSubGroup(id: string): Promise<AppState> {
        // delete subgroup
        const subGroups = { ...this.state.subgroups };
        delete subGroups[id];
        this.state = {
            ...this.state,
            subgroups: subGroups
        };
        // delete links
        Object
            .values(this.state.links)
            .filter(link => link.subGroupId === id)
            .forEach(link => this.deleteLink(link.id));
        return this.save();
    }

    /**
     *  Move links out of subgroup to root level of group, keep subgroup intact
     */
    moveLinksFromSubgroup(id: string): Promise<AppState> {
        const updatedLinks: Record<string, Link> = { ...this.state.links };
        Object.values(updatedLinks)
            .filter(link => link.subGroupId === id)
            .forEach(link => {
                updatedLinks[link.id] = { ...link, subGroupId: undefined };
            });
        this.state = { ...this.state, links: updatedLinks };
        return this.save();
    }

    /**
     *  Move links out of subgroup to root level of group, then delete the subgroup
     */
    ceaseSubgroup(id: string): Promise<AppState> {
        const updatedLinks: Record<string, Link> = { ...this.state.links };
        Object.values(updatedLinks)
            .filter(link => link.subGroupId === id)
            .forEach(link => {
                updatedLinks[link.id] = { ...link, subGroupId: undefined };
            });
        const updatedSubgroups = { ...this.state.subgroups };
        delete updatedSubgroups[id];
        this.state = { ...this.state, links: updatedLinks, subgroups: updatedSubgroups };
        return this.save();
    }

    // Link operations

    /**
     *  Create new link for given group (and sub-group if selected) in current workspace
     */
    createLink(url: string, title: string, groupId: string, subGroupId?: string): Promise<AppState> {

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
                    environmentId: this.getCurrentEnvironmentId()!, // in that case environment must already exist
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
    editLink(url: string, title: string, id: string, groupId: string,
             subGroupId?: string, workspaceId?: string, position?: number
    ): Promise<AppState> {

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

        if (!workspaceId) {
            workspaceId = this.getCurrentEnvironmentId()!;
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
    deleteLink(id: string): Promise<AppState> {
        const links = { ...this.state.links };
        delete links[id];
        this.state = {
            ...this.state,
            links
        };
        return this.save();
    }



    moveLinkUp(id: string): Promise<AppState> {
        const link = this.state.links[id];
        if (!link || link.position <= 0) return Promise.resolve(this.state);
        return this.editLink(link.url, link.title, id, link.groupId, link.subGroupId, link.environmentId, link.position - 1);
    }

    moveLinkDown(id: string): Promise<AppState> {
        const link = this.state.links[id];
        if (!link) return Promise.resolve(this.state);
        if (link.position >= this.getMaxPositionInScope(link.groupId, link.subGroupId)) return Promise.resolve(this.state);
        return this.editLink(link.url, link.title, id, link.groupId, link.subGroupId, link.environmentId, link.position + 1);
    }

    moveSubgroupUp(id: string): Promise<AppState> {
        const sg = this.state.subgroups[id];
        if (!sg || sg.position <= 0) return Promise.resolve(this.state);
        return this.editSubgroupPosition(id, sg.position - 1, sg.groupId);
    }

    moveSubgroupDown(id: string): Promise<AppState> {
        const sg = this.state.subgroups[id];
        if (!sg) return Promise.resolve(this.state);
        if (sg.position >= this.getMaxPositionInScope(sg.groupId)) return Promise.resolve(this.state);
        return this.editSubgroupPosition(id, sg.position + 1, sg.groupId);
    }

    /**
     * Moves a subgroup to a new position within its group, shifting all sibling
     * root-level links and subgroups that occupy the range between old and new position.
     * Links inside subgroups are not affected (they have their own position scope).
     */
    private editSubgroupPosition(id: string, newPosition: number, groupId: string): Promise<AppState> {
        const currentPosition = this.state.subgroups[id].position;
        if (currentPosition === newPosition) return Promise.resolve(this.state);

        const shift = (pos: number): number => {
            if (newPosition < currentPosition && pos >= newPosition && pos < currentPosition) return pos + 1;
            if (newPosition > currentPosition && pos <= newPosition && pos > currentPosition) return pos - 1;
            return pos;
        };

        const updatedLinks: Record<string, Link> = {};
        Object.entries(this.state.links)
            .filter(([_, link]) => link.groupId === groupId && !link.subGroupId)
            .forEach(([linkId, link]) => {
                updatedLinks[linkId] = { ...link, position: shift(link.position) };
            });

        const updatedSubgroups: Record<string, Subgroup> = {};
        Object.entries(this.state.subgroups)
            .filter(([_, sg]) => sg.groupId === groupId)
            .forEach(([sgId, sg]) => {
                updatedSubgroups[sgId] = sgId === id
                    ? { ...sg, position: newPosition }
                    : { ...sg, position: shift(sg.position) };
            });

        this.state = {
            ...this.state,
            links: { ...this.state.links, ...updatedLinks },
            subgroups: { ...this.state.subgroups, ...updatedSubgroups }
        };
        return this.save();
    }

    /**
     * Returns the highest position value among all items that share the same
     * position scope as the given location.
     *
     * - Inside a subgroup: only links within that subgroup are compared.
     * - Root level of a group: root-level links (no subGroupId) AND subgroups
     *   are compared together, because they share the same position sequence.
     */
    private getMaxPositionInScope(groupId: string, subGroupId?: string): number {
        if (subGroupId) {
            const positions = Object.values(this.state.links)
                .filter(l => l.subGroupId === subGroupId)
                .map(l => l.position);
            return positions.length === 0 ? 0 : Math.max(...positions);
        }
        const positions = [
            ...Object.values(this.state.links)
                .filter(l => l.groupId === groupId && !l.subGroupId)
                .map(l => l.position),
            ...Object.values(this.state.subgroups)
                .filter(sg => sg.groupId === groupId)
                .map(sg => sg.position)
        ];
        return positions.length === 0 ? 0 : Math.max(...positions);
    }

    private getOrderForNewGroup(environmentId: string): number {
        const orders = Object.values(this.state.groups)
            .filter(g => g.environmentId === environmentId)
            .map(g => g.order)
            .filter((o): o is number => o !== undefined);

        return orders.length === 0 ? 0 : Math.max(...orders) + 1;
    }

    private getPositionForNewLink(groupId: string, subGroupId: string | null | undefined): number {
        const positions = Object.values(this.state.links)
            .filter(link => {
                if (subGroupId !== undefined && subGroupId !== null && subGroupId !== "") {
                    return link.subGroupId === subGroupId;
                }
                return link.groupId === groupId;
            })
            .map(link => link.position)
            .filter((p): p is number => p !== undefined);

        return positions.length === 0 ? 0 : Math.max(...positions) + 1;
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
