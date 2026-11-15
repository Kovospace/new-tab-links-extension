import type { AppState } from "../../entity/AppStateEntity";

/**
 *  What the right-click "bookmark into…" submenu offers: the groups of the open workspace,
 *  each with its subgroups.
 *
 *  Pure, and kept apart from the Chrome wiring in `bookmarkCurrentPage.ts`, because the menu
 *  has to be built before anybody opens it - Chrome has no "the menu is about to show" moment
 *  - so it is rebuilt from storage whenever the profile changes, and what decides whether a
 *  rebuild is needed at all is a comparison of two of these trees.
 */

/** One place a link can go inside a group. */
export interface BookmarkMenuSubgroup {
    id: string;
    title: string;
}

/** A group of the open workspace, and the subgroups it holds, in the order they are drawn. */
export interface BookmarkMenuGroup {
    id: string;
    title: string;
    subgroups: BookmarkMenuSubgroup[];
}

/**
 *  Where a clicked menu entry puts the link. A group alone means the group's root level.
 */
export interface BookmarkMenuTarget {
    groupId: string;
    subgroupId?: string;
}

/** Separates the parts of a menu entry's identifier. Neither a uuid nor a prefix holds one. */
const ID_SEPARATOR = "|";

/**
 *  The groups of the workspace open on this device, in the order the workspace draws them.
 *
 *  The open workspace is resolved the way `AppStateRepository.getCurrentEnvironmentId` does
 *  it: the stored one while it exists, otherwise the first there is. Empty when there is no
 *  profile, no workspace or no group - which leaves the plain entry that opens the popup.
 *
 *  @param state the active profile's stored data, or null when nothing is stored
 */
export function bookmarkMenuTree(state: AppState | null): BookmarkMenuGroup[] {
    if (!state) {
        return [];
    }
    const workspaceId = openWorkspaceId(state);
    if (!workspaceId) {
        return [];
    }
    const subgroups = Object.values(state.subgroups ?? {});

    return Object.values(state.groups ?? {})
        .filter(group => group.environmentId === workspaceId)
        .sort((one, other) => (one.order ?? 0) - (other.order ?? 0))
        .map(group => ({
            id: group.id,
            title: group.title,
            subgroups: subgroups
                .filter(subgroup => subgroup.groupId === group.id)
                .sort((one, other) => one.position - other.position)
                .map(subgroup => ({ id: subgroup.id, title: subgroup.title }))
        }));
}

/**
 *  The name of the workspace the submenu offers the groups of, shown at its top so it is
 *  clear which workspace a link is going into.
 *
 *  @param state the active profile's stored data, or null when nothing is stored
 */
export function bookmarkMenuWorkspaceName(state: AppState | null): string | null {
    const workspaceId = state ? openWorkspaceId(state) : null;
    return workspaceId ? state!.environments[workspaceId]?.name ?? null : null;
}

/** The workspace open on this device, or null when the profile has none. */
export function openWorkspaceId(state: AppState): string | null {
    const environments = state.environments ?? {};
    if (state.activeEnvironmentId && environments[state.activeEnvironmentId]) {
        return state.activeEnvironmentId;
    }
    return Object.keys(environments)[0] ?? null;
}

/**
 *  The identifier of the menu entry that puts a link into a group or a subgroup.
 *
 *  The target travels in the identifier because that is all `contextMenus.onClicked` reports,
 *  and the worker may have been stopped and restarted between drawing the menu and the click.
 *
 *  @param prefix which of the two menus - the page's or a link's
 */
export function targetMenuItemId(prefix: string, target: BookmarkMenuTarget): string {
    return [prefix, target.groupId, target.subgroupId ?? ""].join(ID_SEPARATOR);
}

/**
 *  Reads a target back out of a menu entry's identifier.
 *
 *  @return the target, or null when the identifier is not a target entry of that menu
 */
export function targetOfMenuItem(prefix: string, menuItemId: string | number): BookmarkMenuTarget | null {
    const parts = String(menuItemId).split(ID_SEPARATOR);
    if (parts.length !== 3 || parts[0] !== prefix || !parts[1]) {
        return null;
    }
    return parts[2]
        ? { groupId: parts[1], subgroupId: parts[2] }
        : { groupId: parts[1] };
}

/**
 *  The open workspace's "Flash save" group (#204), or null when it has none yet.
 *
 *  Found by its name in any language the extension speaks, case and surrounding spaces aside:
 *  the group is named in the reader's language when it is made, and a reader who changes language
 *  afterwards must not get a second one.
 *
 *  @param state the active profile's data
 *  @param names what the group is called, in every language
 */
export function flashSaveGroupId(state: AppState, names: ReadonlyArray<string>): string | null {
    const workspaceId = openWorkspaceId(state);
    if (!workspaceId) {
        return null;
    }
    const wanted = new Set(names.map(name => name.trim().toLowerCase()));
    return Object.values(state.groups ?? {})
        .filter(group => group.environmentId === workspaceId && wanted.has(group.title.trim().toLowerCase()))
        .sort((one, other) => (one.order ?? 0) - (other.order ?? 0))[0]?.id ?? null;
}

