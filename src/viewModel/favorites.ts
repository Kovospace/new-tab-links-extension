import { AppState, Link, ProfileData } from "../backend/entity/AppStateEntity";
import { profileRepository, ProfileRepository } from "../backend/repository/ProfileRepository";
import { appStateRepository, AppStateRepository } from "../backend/repository/AppStateRepository";
import { normalizeUrl } from "../backend/worker/module/linkTabGroupCatcher";

/**
 *  Favorites (#183): links marked with the circle beside them, listed in the side panel's
 *  Favorites card and in the bookmarking popup - those of the open workspace, in the order the
 *  page draws them. The mark is the link's own (`Link.favorite`, synchronised). Whether the
 *  profile uses favorites at all is `enableFavorites`, off by default.
 */

/** The root's attribute that says favorites are on, which is what the stylesheet keys off. */
export const ATTRIBUTE_FAVORITES = "favorites";

/** A favorite as the panel and the popup list it. */
export interface FavoriteDTO {
    id: string;
    title: string;
    url: string;
    /** The group it is in, and the subgroup when it is in one: "Work › Tools". */
    place: string;
}

/** Whether the open profile uses favorites. */
export function favoritesEnabled(profiles: Pick<ProfileRepository, "getSettings"> = profileRepository): boolean {
    try {
        return profiles.getSettings().enableFavorites;
    } catch {
        // No profiles read yet - a part of a page drawn on its own, as the tests draw them.
        return false;
    }
}

/**
 *  Marks the root while favorites are on, and keeps it marked as the setting changes, from
 *  any page. The circles are always built and the stylesheet shows them only under the mark,
 *  so turning favorites on or off redraws nothing.
 */
export function followFavoritesSwitch(
    profiles: Pick<ProfileRepository, "getSettings" | "profiles$"> = profileRepository,
    root: HTMLElement = document.documentElement
): void {
    profiles.profiles$.subscribe(() => {
        if (favoritesEnabled(profiles)) {
            root.dataset[ATTRIBUTE_FAVORITES] = "on";
        } else {
            delete root.dataset[ATTRIBUTE_FAVORITES];
        }
    });
}

/**
 *  The favorites of one workspace in the order the page draws them: group by group, and in a
 *  group its own links and its subgroups in their shared sequence, a subgroup's links in
 *  their place.
 *
 *  @param data        the profile's data
 *  @param workspaceId which workspace
 */
export function favoritesOfWorkspace(
    data: Pick<ProfileData, "groups" | "subgroups" | "links">, workspaceId: string
): FavoriteDTO[] {
    const groups = Object.values(data.groups)
        .filter(group => group.environmentId === workspaceId)
        .sort((one, other) => (one.order ?? 0) - (other.order ?? 0));
    const favorites: FavoriteDTO[] = [];
    for (const group of groups) {
        const links = Object.values(data.links).filter(link => link.groupId === group.id);
        const subgroups = Object.values(data.subgroups).filter(subgroup => subgroup.groupId === group.id);
        const sequence: Array<{ position: number; links: Link[]; place: string }> = [
            ...links.filter(link => !link.subGroupId).map(link =>
                ({ position: link.position, links: [link], place: group.title })),
            ...subgroups.map(subgroup => ({
                position: subgroup.position,
                links: links.filter(link => link.subGroupId === subgroup.id)
                    .sort((one, other) => one.position - other.position),
                place: `${group.title} › ${subgroup.title}`
            }))
        ].sort((one, other) => one.position - other.position);
        for (const item of sequence) {
            for (const link of item.links) {
                if (link.favorite === true) {
                    favorites.push({ id: link.id, title: link.title || link.url, url: link.url, place: item.place });
                }
            }
        }
    }
    return favorites;
}

/**
 *  The link of this workspace kept under this address, if there is one: what a favorite circle
 *  on a closed tab, a visit or a search suggestion stands for. Addresses are compared the way
 *  the tab catcher and the "already kept" marks compare them: a trailing slash is not a
 *  different page.
 */
export function linkWithAddress(
    data: Pick<AppState, "links">, workspaceId: string, url: string
): Link | null {
    const wanted = normalizeUrl(url) ?? url;
    return Object.values(data.links).find(link =>
        link.environmentId === workspaceId && (normalizeUrl(link.url) ?? link.url) === wanted) ?? null;
}

/** Whether the open workspace keeps this address as a favorite. */
export function isAddressFavorite(
    url: string,
    appState: AppStateRepository = appStateRepository,
    profiles: Pick<ProfileRepository, "getSettings"> = profileRepository
): boolean {
    if (!favoritesEnabled(profiles)) {
        return false;
    }
    const workspaceId = appState.getCurrentEnvironmentId();
    return workspaceId !== null
        && linkWithAddress(appState.state$.get(), workspaceId, url)?.favorite === true;
}

/**
 *  Marks or unmarks, as a favorite, the open workspace's link kept under this address.
 *
 *  @return false when the workspace keeps no such link: a favorite has to be a link first, so
 *          the caller offers to save it as one, with "Favorite" ticked
 */
export async function setAddressFavorite(
    url: string, favorite: boolean, appState: AppStateRepository = appStateRepository
): Promise<boolean> {
    const workspaceId = appState.getCurrentEnvironmentId();
    const link = workspaceId ? linkWithAddress(appState.state$.get(), workspaceId, url) : null;
    if (!link) {
        return false;
    }
    await appState.setLinkFavorite(link.id, favorite);
    return true;
}
