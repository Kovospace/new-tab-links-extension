import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { Logger } from "../utils/logger";

/** One place a bookmark can be put: a group, or a subgroup of one. */
export interface BookmarkTargetDTO {
    id: string;
    title: string;
}

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
     *  Whether there is anywhere to put a bookmark.
     *
     *  A profile with no workspace, or whose workspaces hold no group, has nowhere to keep a
     *  link and nothing sensible to offer in the dropdown. The window says so rather than creating
     *  a workspace behind the user's back - the first workspace is a decision, and it is made
     *  on the new tab page.
     */
    public canBookmark(): boolean {
        return this.getWorkspaces().some(workspace => this.getGroups(workspace.id).length > 0);
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
     */
    public async save(
        url: string,
        title: string,
        groupId: string,
        subGroupId?: string
    ): Promise<void> {
        this.LOG.debug("save", `${title} -> group ${groupId}, subgroup ${subGroupId ?? "-"}`);
        await this.appState.createLink(url, title, groupId, subGroupId);
    }
}
