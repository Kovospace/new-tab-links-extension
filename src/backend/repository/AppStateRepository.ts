import {AppState, Environment, Group, Link, GroupItem, Subgroup, ProfileData} from "../entity/AppStateEntity";
import {ChromeStorageWrapper} from "../datasource/chromeStorage/chromeStorageWrapper";
import {uid} from "./AppStateRepositoryUtils";
import {ObservableValue} from "../../utils/observableValue";
import {appStateInit, emptyProfileData} from "../datasource/init/AppStateInit";
import {Logger} from "../../utils/logger"
import {APP_STATE_PREFIX} from "../datasource/chromeStorage/storageKeys";
import {chooseTabGroupColor, TabGroupColor} from "../entity/TabGroupColors";
import deepEqual from "fast-deep-equal";

export class AppStateRepository {

    private LOG!: Logger

    private state!: AppState;
    //private initialState!: AppState;
    readonly state$ = new ObservableValue<AppState>(appStateInit);

    /**
     * Fires the active profile's identifier every time this profile's data is written,
     * whether or not the UI was notified.
     *
     * Kept separate from state$ on purpose. state$ exists to redraw the page and is
     * deliberately not fired by saveQuiet(), because the component that triggered the change
     * has already updated itself - but a change that skips the redraw is still a change the
     * backend has to hear about. Subscribing to state$ instead would silently never
     * synchronise a collapsed subgroup.
     *
     * It carries the profile identifier rather than the state so that a subscriber cannot be
     * fooled by two consecutive saves of deep-equal data into thinking nothing happened.
     */
    readonly persisted$ = new ObservableValue<{ profileId: string; at: number }>(
        { profileId: "", at: 0 });

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
        this.watchForExternalWrites();
        return this.save();
    }

    /**
     * Adopts a write to the loaded profile made by another page of this extension.
     *
     * There is more than one page now: the new tab page and the bookmarking window, and both
     * hold their own copy of the state in memory. Without this, a bookmark added in the small
     * window would be invisible to a new tab page that was already open - and worse, the next
     * thing done in that page would write its own older copy back over it.
     *
     * A write this repository made itself arrives here too, and is deep-equal to what is
     * already held, so it is ignored - which also keeps a pull from being pushed straight
     * back out again.
     *
     * chrome.storage.onChanged is absent in the tests, which fake the storage rather than the
     * whole API, so its absence is not an error.
     */
    private watchForExternalWrites(): void {

        if (!chrome.storage?.onChanged?.addListener) {
            return;
        }

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }
            const incoming = changes[APP_STATE_PREFIX + this.state.activeProfileId]
                ?.newValue as AppState | undefined;

            if (!incoming || deepEqual(incoming, this.state)) {
                return;
            }
            this.LOG.debug("watchForExternalWrites", "Adopting a write made in another page");
            this.state = incoming;
            this.state$.set(this.state);
            // The stored data has moved on, and this page may be the only one signed in and
            // synchronising - the window that wrote it does not synchronise at all.
            this.announcePersisted();
        });
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
        this.announcePersisted();
        return this.state;
    }

    /** Persists state to storage without firing state$ — use when the UI updates itself directly. */
    private async saveQuiet(): Promise<void> {
        await this.datasource.save(APP_STATE_PREFIX + this.state.activeProfileId, this.state);
        this.announcePersisted();
    }

    /** Tells the synchronisation layer that this profile's stored data has moved on. */
    private announcePersisted(): void {
        this.persisted$.set({ profileId: this.state.activeProfileId, at: Date.now() });
    }

    /**
     * Reads a profile's stored data without loading it or disturbing the active one.
     * Used by synchronisation, which has to reason about profiles the user is not looking at.
     */
    public async readProfileData(profileId: string): Promise<ProfileData | null> {
        const saved = await this.datasource.get<AppState>(APP_STATE_PREFIX + profileId);
        if (!saved) {
            return null;
        }
        const { environments, groups, subgroups, links, activeEnvironmentId } = saved;
        return { environments, groups, subgroups, links, activeEnvironmentId };
    }

    /** Forgets a profile's stored data entirely; the registry entry is not this class's business. */
    public async discardProfileData(profileId: string): Promise<void> {
        await this.datasource.save(APP_STATE_PREFIX + profileId, null);
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

    /**
     * The workspace to show, or null when this profile genuinely has none.
     *
     * It asks getCurrentEnvironmentId() rather than reading activeEnvironmentId itself,
     * because that method is the one that repairs the field: a profile can hold workspaces
     * while naming none as open, or name one that has since been deleted, and in both cases
     * the first workspace it has is the right answer.
     *
     * This used to return null the moment activeEnvironmentId was unset, which short-circuited
     * that repair and reported "no workspaces" for a profile full of them. main.ts reads this
     * to decide between the first-run screen and the application, so a profile pulled from the
     * account - which arrives with no opinion about which workspace is open, that being a
     * per-device choice - was shown the first-run screen, and the reload guard on that screen
     * then reloaded the page for ever.
     */
    getCurrentEnvironment(): Environment | null {
        const id = this.getCurrentEnvironmentId();
        return id ? this.state.environments[id] : null;
    }

    getGroups(workspaceId: string) {
        return Object
            .values(this.state.groups)
            .filter((group: Group) => group.environmentId === workspaceId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    /**
     *  All workspaces of the loaded profile, in the order the workspace switcher shows them.
     */
    /**
     *  The subgroups of one group, in the order the group draws them.
     */
    getSubgroups(groupId: string): Subgroup[] {
        return Object
            .values(this.state.subgroups)
            .filter((subgroup: Subgroup) => subgroup.groupId === groupId)
            .sort((a, b) => a.position - b.position);
    }

    getWorkspaces(): Environment[] {
        return Object
            .values(this.state.environments)
            .sort((a: Environment, b: Environment) => a.createdAt - b.createdAt);
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
    createGroup(title: string, environmentId: string, description?: string | undefined): Promise<AppState> {
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
                    description: description,
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

    /**
     *  Moves a group, with everything under it, into another workspace.
     *
     *  Subgroups and links repeat their group's `environmentId` rather than deriving it, and
     *  the group body is filtered on that field - so a group whose own workspace changed while
     *  its contents did not would arrive at the target empty and leave its links behind,
     *  reachable from nowhere. They are rewritten here for the same reason a pulled snapshot
     *  derives them from the group: the group is what decides which workspace they are in.
     *
     *  The group lands at the end of the target workspace, and the gap it leaves behind is
     *  closed so the source workspace keeps a contiguous order sequence.
     */
    moveGroupToWorkspace(id: string, targetEnvironmentId: string): Promise<AppState> {

        this.LOG.debug("moveGroupToWorkspace", `id: ${id}, target: ${targetEnvironmentId}`);

        const group = this.state.groups[id];
        if (!group || !this.checkEnvironmentExists(targetEnvironmentId)) {
            console.error(`Cannot move group ${id} into workspace ${targetEnvironmentId}`);
            return Promise.resolve(this.state);
        }
        if (group.environmentId === targetEnvironmentId) {
            return Promise.resolve(this.state);
        }

        const sourceEnvironmentId = group.environmentId;
        const vacatedOrder = group.order ?? 0;

        const updatedGroups: Record<string, Group> = {
            [id]: {
                ...group,
                environmentId: targetEnvironmentId,
                order: this.getOrderForNewGroup(targetEnvironmentId)
            }
        };
        Object
            .values(this.state.groups)
            .filter(sibling => sibling.id !== id
                && sibling.environmentId === sourceEnvironmentId
                && (sibling.order ?? 0) > vacatedOrder)
            .forEach(sibling => {
                updatedGroups[sibling.id] = { ...sibling, order: (sibling.order ?? 0) - 1 };
            });

        const updatedSubgroups: Record<string, Subgroup> = {};
        Object
            .values(this.state.subgroups)
            .filter(subgroup => subgroup.groupId === id)
            .forEach(subgroup => {
                updatedSubgroups[subgroup.id] = {
                    ...subgroup,
                    environmentId: targetEnvironmentId
                };
            });

        const updatedLinks: Record<string, Link> = {};
        Object
            .values(this.state.links)
            .filter(link => link.groupId === id)
            .forEach(link => {
                updatedLinks[link.id] = { ...link, environmentId: targetEnvironmentId };
            });

        this.state = {
            ...this.state,
            groups: { ...this.state.groups, ...updatedGroups },
            subgroups: { ...this.state.subgroups, ...updatedSubgroups },
            links: { ...this.state.links, ...updatedLinks }
        };
        return this.save();
    }

    // Subgroup operations

    /**
     *  Create new sub-group at the end of the given group
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
                    catchLinksIntoTabGroup: false,
                    // Given a colour at birth rather than when it is first opened as tabs:
                    // the heading is tinted with it straight away, and a colour that appeared
                    // only once the subgroup had been used would look like a glitch.
                    color: this.colorForNewSubgroup(),
                    position: this.getPositionForNewItem(groupId)
                } satisfies Subgroup
            }
        };
        return this.save();
    }

    /**
     * Turns the subgroup's "catch links into tab group" setting on or off.
     *
     * Saved loudly, unlike the collapsed flag: the setting is shown as a state in the
     * subgroup menu, so the page has to redraw, and the background listener reads it back
     * out of storage.
     */
    toggleSubgroupCatchLinksIntoTabGroup(id: string): Promise<AppState> {
        const subgroup = this.state.subgroups[id];
        if (!subgroup) return Promise.resolve(this.state);
        this.state = {
            ...this.state,
            subgroups: {
                ...this.state.subgroups,
                [id]: { ...subgroup, catchLinksIntoTabGroup: !subgroup.catchLinksIntoTabGroup }
            }
        };
        return this.save();
    }

    /**
     * Paints a subgroup's tab group a different colour.
     *
     * Saved loudly: the heading is tinted with it, so the page has to redraw, and the change
     * has to reach the account like any other property of the subgroup.
     */
    setSubgroupColor(id: string, color: TabGroupColor): Promise<AppState> {
        const subgroup = this.state.subgroups[id];
        if (!subgroup || subgroup.color === color) return Promise.resolve(this.state);
        this.state = {
            ...this.state,
            subgroups: {
                ...this.state.subgroups,
                [id]: { ...subgroup, color }
            }
        };
        return this.save();
    }

    /**
     * The colour a subgroup created now should take: one nothing in this profile is using,
     * or the least-used when every colour is taken. See `chooseTabGroupColor`.
     *
     * The whole profile is counted rather than the workspace or the group, because a tab
     * group is a thing in the browser: two subgroups of the same colour are confusing side
     * by side in the tab strip however far apart they are on the page.
     */
    private colorForNewSubgroup(): TabGroupColor {
        return chooseTabGroupColor(
            Object.values(this.state.subgroups).map(subgroup => subgroup.color));
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
        const nextPosition: number = this.getPositionForNewItem(groupId, subGroupId);

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
             subGroupId?: string, workspaceId?: string
    ): Promise<AppState> {

        this.LOG.debug(
            "editLink",
            `workspaceId: ${workspaceId}, groupId: ${groupId}, subGroupId: ${subGroupId}, 
            id: ${id}, title: ${title}, url: ${url}`);

        const linksToEdit: Record<string, Link> = {
            [id]: this.state.links[id]
        };

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



    /**
     * Moves a root-level link into a subgroup, placing it at the end of that subgroup's
     * position sequence and compacting the gap it leaves in the root-level scope.
     */
    moveLinkToSubgroup(linkId: string, targetSubGroupId: string): Promise<AppState> {
        const link = this.state.links[linkId];
        if (!link || link.subGroupId) return Promise.resolve(this.state);

        const newPosition = this.getPositionForNewItem(link.groupId, targetSubGroupId);

        const updatedLinks: Record<string, Link> = {};
        Object.entries(this.state.links)
            .filter(([_, l]) => l.groupId === link.groupId && !l.subGroupId)
            .forEach(([id, l]) => {
                if (id === linkId) {
                    updatedLinks[id] = { ...l, subGroupId: targetSubGroupId, position: newPosition };
                } else if (l.position > link.position) {
                    updatedLinks[id] = { ...l, position: l.position - 1 };
                } else {
                    updatedLinks[id] = l;
                }
            });

        const updatedSubgroups: Record<string, Subgroup> = {};
        Object.entries(this.state.subgroups)
            .filter(([_, sg]) => sg.groupId === link.groupId && sg.position > link.position)
            .forEach(([id, sg]) => {
                updatedSubgroups[id] = { ...sg, position: sg.position - 1 };
            });

        this.state = {
            ...this.state,
            links: { ...this.state.links, ...updatedLinks },
            subgroups: { ...this.state.subgroups, ...updatedSubgroups }
        };
        return this.save();
    }

    /**
     * Moves a link out of its subgroup to the end of the root-level position sequence,
     * compacting the gap it leaves in the subgroup scope.
     */
    moveLinkOutOfSubgroup(linkId: string): Promise<AppState> {
        const link = this.state.links[linkId];
        if (!link || !link.subGroupId) return Promise.resolve(this.state);

        const oldSubGroupId = link.subGroupId;

        // Compact the subgroup scope first
        const compactedLinks: Record<string, Link> = {};
        Object.entries(this.state.links)
            .filter(([id, l]) => l.subGroupId === oldSubGroupId && id !== linkId)
            .forEach(([id, l]) => {
                compactedLinks[id] = l.position > link.position
                    ? { ...l, position: l.position - 1 }
                    : l;
            });

        this.state = { ...this.state, links: { ...this.state.links, ...compactedLinks } };

        const newPosition = this.getPositionForNewItem(link.groupId, undefined);

        this.state = {
            ...this.state,
            links: {
                ...this.state.links,
                [linkId]: { ...this.state.links[linkId], subGroupId: undefined, position: newPosition }
            }
        };
        return this.save();
    }

    moveLinkUp(id: string): Promise<AppState> {
        return this.moveWithinPositionScope(id, -1);
    }

    moveLinkDown(id: string): Promise<AppState> {
        return this.moveWithinPositionScope(id, 1);
    }

    moveGroupUp(id: string): Promise<AppState> {
        const group = this.state.groups[id];
        if (!group || (group.order ?? 0) <= 0) return Promise.resolve(this.state);
        return this.editGroupOrder(id, (group.order ?? 0) - 1, group.environmentId);
    }

    moveGroupDown(id: string): Promise<AppState> {
        const group = this.state.groups[id];
        if (!group) return Promise.resolve(this.state);
        if ((group.order ?? 0) >= this.getMaxOrderInEnvironment(group.environmentId)) return Promise.resolve(this.state);
        return this.editGroupOrder(id, (group.order ?? 0) + 1, group.environmentId);
    }

    /**
     * Moves a group to a new order within its environment, shifting all sibling groups
     * that occupy the range between the old and new order.
     */
    private editGroupOrder(id: string, newOrder: number, environmentId: string): Promise<AppState> {
        const currentOrder = this.state.groups[id].order ?? 0;
        if (currentOrder === newOrder) return Promise.resolve(this.state);

        const shift = (order: number): number => {
            if (newOrder < currentOrder && order >= newOrder && order < currentOrder) return order + 1;
            if (newOrder > currentOrder && order <= newOrder && order > currentOrder) return order - 1;
            return order;
        };

        const updatedGroups: Record<string, Group> = {};
        Object.entries(this.state.groups)
            .filter(([_, g]) => g.environmentId === environmentId)
            .forEach(([gId, g]) => {
                updatedGroups[gId] = gId === id
                    ? { ...g, order: newOrder }
                    : { ...g, order: shift(g.order ?? 0) };
            });

        this.state = {
            ...this.state,
            groups: { ...this.state.groups, ...updatedGroups }
        };
        return this.save();
    }

    private getMaxOrderInEnvironment(environmentId: string): number {
        const orders = Object.values(this.state.groups)
            .filter(g => g.environmentId === environmentId)
            .map(g => g.order ?? 0);
        return orders.length === 0 ? 0 : Math.max(...orders);
    }

    moveSubgroupUp(id: string): Promise<AppState> {
        return this.moveWithinPositionScope(id, -1);
    }

    moveSubgroupDown(id: string): Promise<AppState> {
        return this.moveWithinPositionScope(id, 1);
    }

    /**
     * Moves a link or a subgroup one step within the sequence it is ordered in.
     *
     * Where that sequence is depends on the item: links inside a subgroup are ordered only
     * against each other, while root-level links and subgroups share a single sequence. That
     * shared sequence is the whole point - a link stepping over a subgroup has to trade
     * positions with the subgroup, not with the next link behind it.
     *
     * The step is taken as an index into the ordered scope and the whole scope is renumbered
     * from it, rather than adding one to a position. Position arithmetic assumes the sequence
     * is already a clean 0..n-1, and it frequently is not: subgroups were created at position
     * 0 whatever the group already held, so a move also has to repair what it walks over.
     */
    private moveWithinPositionScope(itemId: string, offset: -1 | 1): Promise<AppState> {
        const item: GroupItem | undefined = this.state.links[itemId] ?? this.state.subgroups[itemId];
        if (!item) return Promise.resolve(this.state);

        const scope = this.getItemsInPositionScope(item);
        const currentIndex = scope.findIndex(scopeItem => scopeItem.id === itemId);
        const targetIndex = currentIndex + offset;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= scope.length) {
            return Promise.resolve(this.state);
        }

        const reordered = [...scope];
        reordered.splice(targetIndex, 0, ...reordered.splice(currentIndex, 1));

        const links = { ...this.state.links };
        const subgroups = { ...this.state.subgroups };
        reordered.forEach((scopeItem, position) => {
            if (links[scopeItem.id]) {
                links[scopeItem.id] = { ...links[scopeItem.id], position };
            } else {
                subgroups[scopeItem.id] = { ...subgroups[scopeItem.id], position };
            }
        });

        this.state = { ...this.state, links, subgroups };
        return this.save();
    }

    /**
     * Everything the given item is ordered against, in the order the group renders it.
     *
     * Items sharing a position are broken apart the way the group view model breaks them -
     * links before subgroups, oldest first - so renumbering a sequence that holds duplicates
     * leaves the user looking at what they were already looking at.
     */
    private getItemsInPositionScope(item: GroupItem): GroupItem[] {
        const subGroupId = this.state.links[item.id]?.subGroupId;
        const scope: GroupItem[] = subGroupId
            ? Object.values(this.state.links).filter(link => link.subGroupId === subGroupId)
            : [
                ...Object.values(this.state.links)
                    .filter(link => link.groupId === item.groupId && !link.subGroupId),
                ...Object.values(this.state.subgroups)
                    .filter(sg => sg.groupId === item.groupId)
            ];

        return scope.sort((a, b) =>
            a.position - b.position
            || Number(a.type === "subgroup") - Number(b.type === "subgroup")
            || a.createdAt - b.createdAt);
    }

    /**
     * The positions already taken in the sequence the given location belongs to.
     *
     * - Inside a subgroup: only the links of that subgroup.
     * - Root level of a group: root-level links (no subGroupId) AND subgroups together,
     *   because they are one sequence.
     */
    private getPositionsInScope(groupId: string, subGroupId?: string | null): number[] {
        if (subGroupId) {
            return Object.values(this.state.links)
                .filter(link => link.subGroupId === subGroupId)
                .map(link => link.position);
        }
        return [
            ...Object.values(this.state.links)
                .filter(link => link.groupId === groupId && !link.subGroupId)
                .map(link => link.position),
            ...Object.values(this.state.subgroups)
                .filter(sg => sg.groupId === groupId)
                .map(sg => sg.position)
        ];
    }

    private getOrderForNewGroup(environmentId: string): number {
        const orders = Object.values(this.state.groups)
            .filter(g => g.environmentId === environmentId)
            .map(g => g.order)
            .filter((o): o is number => o !== undefined);

        return orders.length === 0 ? 0 : Math.max(...orders) + 1;
    }

    /**
     * The position a newly created link or subgroup takes: behind everything already in its
     * sequence. A new root-level link has to clear the group's subgroups as well as its
     * links, and a new subgroup has to clear both too.
     */
    private getPositionForNewItem(groupId: string, subGroupId?: string | null): number {
        const positions = this.getPositionsInScope(groupId, subGroupId);
        return positions.length === 0 ? 0 : Math.max(...positions) + 1;
    }
}

export const appStateRepository = new AppStateRepository();
