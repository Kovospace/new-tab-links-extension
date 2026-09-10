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
 *  The workspace is not one of the questions. Which workspace is open is per-device and is
 *  what the user is working in right now, so a page bookmarked from the keyboard lands there;
 *  the form only names it, so that the user can see where the link is going.
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

    /** The groups of the open workspace, in the order the workspace draws them. */
    public getGroups(): BookmarkTargetDTO[] {
        const workspaceId = this.appState.getCurrentEnvironmentId();
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
     *  A profile with no workspace, or a workspace with no group, has nowhere to keep a link
     *  and nothing sensible to offer in the dropdown. The window says so rather than creating
     *  a workspace behind the user's back - the first workspace is a decision, and it is made
     *  on the new tab page.
     */
    public canBookmark(): boolean {
        return this.getGroups().length > 0;
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
