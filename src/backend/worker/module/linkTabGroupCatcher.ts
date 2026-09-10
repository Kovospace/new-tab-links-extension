import type { AppState, Link, Subgroup } from "../../entity/AppStateEntity";
import type { ProfileRegistry } from "../../repository/ProfileRepository";
import { ChromeStorageWrapper } from "../../datasource/chromeStorage/chromeStorageWrapper";
import { PROFILE_REGISTRY_KEY, appStateKey } from "../../datasource/chromeStorage/storageKeys";
import { TAB_GROUP_NONE, groupTabsUnderTitle } from "./tabGroups";
import { DEFAULT_TAB_GROUP_COLOR } from "../../entity/TabGroupColors";
import { Logger } from "../../../utils/logger";

/**
 *  Pulls a tab that lands on a subgroup's link into that subgroup's tab group.
 *
 *  This is the whole point of a subgroup's "catch links into tab group" setting: it should
 *  not matter whether the link was opened from the new tab page, from a bookmark, from
 *  another site or from the address bar - the tab belongs beside the subgroup's other tabs.
 *  So the decision is made here, on the navigation itself, rather than on the click.
 *
 *  Living in the service worker is what makes that possible, and also what constrains it.
 *  MV3 stops the worker after thirty seconds of quiet, so nothing may be held in memory
 *  between navigations: every event re-reads the state from storage. A listener registered
 *  at the top level of the worker is what Chrome wakes the worker back up for, which is why
 *  `registerLinkTabGroupCatcher()` is called during the worker's own evaluation and not
 *  lazily from somewhere else.
 *
 *  Only the profile currently loaded is searched. Profiles are separate worlds - the point
 *  of having them is that what is in one does not act on your browsing while another is
 *  open.
 */

const LOG = new Logger("LinkTabGroupCatcher");

const storage = new ChromeStorageWrapper();

/** Registers the navigation listener. Call once, from the service worker's top level. */
export function registerLinkTabGroupCatcher(): void {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        // Only a navigation carries a url; the other updates (title, favicon, status) do not
        // change where the tab belongs.
        if (!changeInfo.url) {
            return;
        }
        catchTab(tabId, changeInfo.url, tab)
            .catch(error => LOG.error("catchTab", error));
    });
}

/**
 *  Groups one navigated tab, if its address is a link of a subgroup that asked for it.
 *
 *  A tab already in a group is left alone, whichever group that is. The user - or another
 *  extension - put it there, and a tab cannot be in two groups; taking it out of one to
 *  satisfy a setting would be the more surprising of the two behaviours. It also means the
 *  tabs opened together from the subgroup menu, which are grouped as they are created, are
 *  not fought over.
 */
async function catchTab(tabId: number, url: string, tab: chrome.tabs.Tab): Promise<void> {

    if (tab.pinned || (tab.groupId !== undefined && tab.groupId !== TAB_GROUP_NONE)) {
        return;
    }

    const state = await readActiveProfileState();
    if (!state) {
        return;
    }

    const subgroup = findCatchingSubgroup(state, url);
    if (!subgroup) {
        return;
    }

    LOG.debug("catchTab", `${url} -> tab group "${subgroup.title}"`);
    // The subgroup's own colour, so a tab caught here lands in a group that looks like the
    // one opening the subgroup from the page would have made. A subgroup stored before
    // colours existed has none, and takes the default.
    await groupTabsUnderTitle(
        subgroup.title, [tabId], tab.windowId, subgroup.color ?? DEFAULT_TAB_GROUP_COLOR);
}

/**
 *  The subgroup that wants this address caught, or null.
 *
 *  @param state  the loaded profile's data
 *  @param url    the address the tab has navigated to
 */
export function findCatchingSubgroup(state: AppState, url: string): Subgroup | null {

    const wanted = normalizeUrl(url);
    if (!wanted) {
        return null;
    }

    const caught = Object
        .values(state.links)
        .find((link: Link) =>
            !!link.subGroupId
            && (state.subgroups[link.subGroupId]?.catchLinksIntoTabGroup ?? false)
            && normalizeUrl(link.url) === wanted);

    return caught?.subGroupId ? state.subgroups[caught.subGroupId] ?? null : null;
}

/**
 *  The comparable form of an address, or null for one that is never caught.
 *
 *  Addresses have to survive the round trip through the address bar to be recognised at all:
 *  a link stored as `https://example.com` arrives back as `https://example.com/`. So the
 *  trailing slash goes, and so does the fragment, which names a place inside a page rather
 *  than a different one. The query string stays - it routinely selects a different page.
 *
 *  Anything that is not http(s) is refused rather than normalised: `chrome://`, `file://`
 *  and the extension's own pages are not what this setting is about, and one of them
 *  matching by accident would grab a tab the user did not mean.
 */
export function normalizeUrl(raw: string): string | null {

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
    }

    // `new URL` has already lowercased the protocol and the host; the path has to be left
    // as it is, because a server is free to tell two of them apart by case.
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`;
}

/** The loaded profile's data, read straight from storage - the worker holds no state. */
async function readActiveProfileState(): Promise<AppState | null> {
    const registry = await storage.get<ProfileRegistry>(PROFILE_REGISTRY_KEY);
    if (!registry?.activeProfileId) {
        return null;
    }
    return storage.get<AppState>(appStateKey(registry.activeProfileId));
}
