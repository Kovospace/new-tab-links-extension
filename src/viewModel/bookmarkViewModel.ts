import { AppState } from "../backend/entity/AppStateEntity";
import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { Logger } from "../utils/logger";
import {
    LimitRefusal, PlanLimits, refusalOfAnotherWorkspace, refusalOfMoreGroups, refusalOfMoreLinks,
    refusalOfMoreSubgroups
} from "../backend/entity/PlanLimits";
import { readStoredPlanLimits } from "../backend/repository/PremiumStanding";

/** One place a bookmark can be put: a group, or a subgroup of one. */
export interface BookmarkTargetDTO {
    id: string;
    title: string;
}

/** A workspace, group or subgroup that already exists, or one to make under the name given. */
export type BookmarkPlace = { id: string } | { create: string; description?: string };

/**
 *  Where a bookmark goes, any part of which may still have to be made.
 *
 *  A new group is always in a workspace that exists by then, and a new subgroup in a group that
 *  does: the form offers "New subgroup…" only under a group it lists.
 */
export interface BookmarkDestination {
    workspace: BookmarkPlace;
    group: BookmarkPlace;
    subgroup?: BookmarkPlace;
}

/** The kinds of record a destination can ask to be made, keyed as `AppState` keeps them. */
type CreatedKind = "environments" | "groups" | "subgroups";

/**
 *  View model behind the bookmarking window.
 *
 *  It does not extend AbstractViewModel, for the same reason ProfileManagerViewModel does not:
 *  that base class maps AppState onto a component's DTO and re-renders on every change, and
 *  this window is not part of the page that changes. It opens on the state as it stands,
 *  asks one question and closes.
 *
 *  The workspace is asked only when there is a choice to make. The open one is the answer
 *  given in advance - it is what the user is working in right now - so a profile with one
 *  workspace is never asked, and one with several opens on the workspace already open.
 */
export class BookmarkViewModel {

    private LOG: Logger = new Logger("BookmarkViewModel");

    private readonly appState: AppStateRepository;

    /**
     *  @param appState where the profile's data lives; the singleton in normal use
     */
    constructor(appState: AppStateRepository = appStateRepository) {
        this.appState = appState;
    }

    /** The open workspace's name, or null when the profile has no workspace at all. */
    public getWorkspaceName(): string | null {
        return this.appState.getCurrentEnvironment()?.name ?? null;
    }

    /** The open workspace, which the form starts on; null when the profile has none. */
    public getCurrentWorkspaceId(): string | null {
        return this.appState.getCurrentEnvironmentId();
    }

    /** Every workspace of the active profile, in the order the workspace switcher shows them. */
    public getWorkspaces(): BookmarkTargetDTO[] {
        return this.appState
            .getEnvironments()
            .map(workspace => ({ id: workspace.id, title: workspace.name }));
    }

    /**
     *  The groups of a workspace, in the order the workspace draws them.
     *
     *  @param workspaceId which workspace; the open one when left out
     */
    public getGroups(
        workspaceId: string | null = this.appState.getCurrentEnvironmentId()
    ): BookmarkTargetDTO[] {
        if (!workspaceId) {
            return [];
        }
        return this.appState
            .getGroups(workspaceId)
            .map(group => ({ id: group.id, title: group.title }));
    }

    /** The subgroups of one group; empty when it has none, which hides the second dropdown. */
    public getSubgroups(groupId: string): BookmarkTargetDTO[] {
        return this.appState
            .getSubgroups(groupId)
            .map(subgroup => ({ id: subgroup.id, title: subgroup.title }));
    }

    /**
     *  Stores the link.
     *
     *  Nothing is synchronised from here: this window holds no session and no baseline. The
     *  write moves the stored profile on, and the next new tab page to synchronise computes
     *  the same difference against the account and pushes it - which is also what happens to
     *  anything created while offline.
     *
     *  @param url         the address to keep
     *  @param title       what to call it
     *  @param groupId     the group it belongs to
     *  @param subGroupId  the subgroup within that group, when one was chosen
     *  @return null when stored; the fair use refusal when the group's workspace is full
     */
    public async save(
        url: string,
        title: string,
        groupId: string,
        subGroupId?: string
    ): Promise<LimitRefusal | null> {
        this.LOG.debug("save", `${title} -> group ${groupId}, subgroup ${subGroupId ?? "-"}`);

        // Asked here rather than left to the repository, which would refuse too: the popup has
        // nobody listening for the repository's notices, and the form says it in place, where
        // another workspace can still be chosen.
        // The limits as stored: the popup publishes no standing of its own. The links cap is a
        // Fair Use one on every plan, so the standing does not change what is said.
        const state = this.appState.state$.get();
        const workspaceId = state.groups[groupId]?.environmentId;
        const refusal = workspaceId
            ? refusalOfMoreLinks(state, workspaceId, 1, await readStoredPlanLimits(), true)
            : null;
        if (refusal) {
            return refusal;
        }

        await this.appState.createLink(url, title, groupId, subGroupId);
        return null;
    }

    /**
     *  Stores the link, first making whatever part of its destination does not exist yet.
     *
     *  This is what a profile with no group - or no workspace at all - is offered instead of
     *  being told there is nowhere to put the link: the user names the group, so making it is
     *  their decision and not one taken behind their back. Every limit is asked before anything
     *  is made, so a refusal never leaves behind an empty group that was made for nothing.
     *
     *  @param url         the address to keep
     *  @param title       what to call it
     *  @param destination where it goes, and what to make on the way
     *  @return null when stored; the refusal when a limit stands in the way
     */
    public async saveInto(
        url: string,
        title: string,
        destination: BookmarkDestination
    ): Promise<LimitRefusal | null> {

        const refusal = this.refusalOf(destination, await readStoredPlanLimits());
        if (refusal) {
            return refusal;
        }

        const { workspace, group, subgroup } = destination;

        const workspaceId = "id" in workspace
            ? workspace.id
            : await this.created("environments",
                () => this.appState.addWorkspace(workspace.create, workspace.description));

        const groupId = "id" in group
            ? group.id
            : workspaceId && await this.created("groups",
                () => this.appState.createGroup(group.create, workspaceId, group.description));

        const subgroupId = !subgroup || "id" in subgroup
            ? subgroup?.id
            : groupId && await this.created("subgroups",
                () => this.appState.createSubGroup(
                    groupId, workspaceId, subgroup.create, subgroup.description));

        if (!groupId || subgroupId === null) {
            // The repository refused what was checked above as allowed - limits it reads
            // differently from the stored ones. Nothing to save into, and nothing to say better.
            this.LOG.warn("saveInto", "A place to save into could not be made");
            return null;
        }
        return this.save(url, title, groupId, subgroupId);
    }

    /**
     *  Why the destination cannot take one more link, or what cannot be made on the way to it.
     *
     *  The standing is taken as premium for the reason `save` gives: the popup publishes none
     *  of its own, and only the workspace limit differs between plans - which a destination asks
     *  to grow only when the profile has no workspace at all.
     */
    private refusalOf(
        { workspace, group, subgroup }: BookmarkDestination,
        limits: PlanLimits
    ): LimitRefusal | null {
        const state = this.appState.state$.get();
        const premium = true;

        if (!("id" in workspace)) {
            return refusalOfAnotherWorkspace(state, limits, premium);
        }
        if (!("id" in group)) {
            return refusalOfMoreGroups(state, workspace.id, 1, limits, premium)
                ?? refusalOfMoreLinks(state, workspace.id, 1, limits, premium);
        }
        const workspaceId = state.groups[group.id]?.environmentId ?? workspace.id;
        const subgroupRefusal = subgroup && !("id" in subgroup)
            ? refusalOfMoreSubgroups(state, group.id, 1, limits, premium)
            : null;
        return subgroupRefusal ?? refusalOfMoreLinks(state, workspaceId, 1, limits, premium);
    }

    /**
     *  Makes one record and answers its identifier, which the repository does not return: it is
     *  the one key the state holds afterwards that it did not hold before.
     *
     *  @return the new identifier; null when the repository refused to make it
     */
    private async created(kind: CreatedKind, make: () => Promise<AppState>): Promise<string | null> {
        const before = new Set(Object.keys(this.appState.state$.get()[kind]));
        const after = await make();
        return Object.keys(after[kind]).find(id => !before.has(id)) ?? null;
    }
}
