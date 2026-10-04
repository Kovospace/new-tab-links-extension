import {
    BookmarkRequest,
    isBookmarkableUrl,
    storePendingBookmark
} from "../../../utils/bookmarkRequest";
import { Logger } from "../../../utils/logger";
import {
    APP_STATE_PREFIX,
    DEVICE_PREFERENCES_KEY,
    PROFILE_REGISTRY_KEY,
    appStateKey
} from "../../datasource/chromeStorage/storageKeys";
import { ChromeStorageWrapper } from "../../datasource/chromeStorage/chromeStorageWrapper";
import type { AppState } from "../../entity/AppStateEntity";
import type { ProfileRegistry } from "../../repository/ProfileRepository";
import { AppStateRepository } from "../../repository/AppStateRepository";
import { appStateInit } from "../../datasource/init/AppStateInit";
import { BookmarkViewModel } from "../../../viewModel/bookmarkViewModel";
import { currentLanguage, setLanguage, t } from "../../../i18n/i18n";
import {
    BookmarkMenuGroup,
    BookmarkMenuTarget,
    bookmarkMenuTree,
    bookmarkMenuWorkspaceName,
    targetMenuItemId,
    targetOfMenuItem
} from "./bookmarkMenuTree";

/**
 *  Bookmarking a page from the right-click menu.
 *
 *  The form itself is the extension's action popup - the bubble the browser draws under the
 *  toolbar icon - declared in the manifest as `action.default_popup`. That is also what the
 *  keyboard shortcut opens, through the reserved `_execute_action` command, so neither of
 *  those two ways in needs any code here at all.
 *
 *  **Why a bubble and not a window.** This used to open a small window of its own. A window
 *  is a browser window, and the browser furnishes it: a title bar, and since Chrome 138 a new
 *  tab page footer naming the extension. A popup is drawn by the browser with none of that,
 *  and sizes itself to the form, which is the other thing a window could not do without
 *  measuring itself.
 *
 *  What is left here is the right-click menu, which cannot open a popup by pointing at it:
 *  `chrome.action.openPopup()` opens the one the manifest names, and it takes no argument. So
 *  the page to bookmark is left in session storage for the popup to take - see
 *  `utils/bookmarkRequest.ts` - and the popup opens onto it.
 *
 *  **Each entry is a submenu of the open workspace's groups**, and a group holding subgroups is
 *  a submenu of its own: choosing one saves the link there and then, with nothing to fill in,
 *  and the toolbar icon shows a tick. The popup stays as the last entry ("Choose a place…"),
 *  and is what a click falls back to whenever saving directly cannot be done - a full
 *  workspace, a group deleted since the menu was drawn - because the popup can say why.
 *  With no group to offer the entry is a single item that opens the popup, as it always was.
 *
 *  Chrome has no "the menu is about to show" moment (Firefox's `menus.onShown` has no Chrome
 *  counterpart), so the menu is built in advance and rebuilt whenever what it shows changes:
 *  the active profile, its data, or the language. Most writes to the profile - a collapsed
 *  subgroup, a link moved - change nothing in the menu, so the tree is compared with the one
 *  last drawn (kept in session storage, since the worker holds nothing) and the menu is left
 *  alone when they match.
 *
 *  **The entries are the only wording the service worker owns**, and they are written in
 *  the language the device is set to like everything else. That costs a read of the device
 *  preferences, because the worker holds nothing between events and has no page to inherit a
 *  language from - and it costs re-creating them when that preference changes, because Chrome
 *  keeps a context menu entry until it is told otherwise: a menu created once in English would
 *  still say so months after the user switched.
 */

const LOG = new Logger("BookmarkCurrentPage");

const storage = new ChromeStorageWrapper();

/** Right-click on the page itself: keep the page. */
const MENU_ITEM_PAGE = "bookmark-page";

/** Right-click on a link: keep where that link goes, not the page it sits on. */
const MENU_ITEM_LINK = "bookmark-link";

/** The last entry of each submenu: the popup, for choosing somewhere else or editing the name. */
const CHOOSE_SUFFIX = "|choose";

/** Session storage key of what the menu was last drawn from - see `rebuildMenuItemsIfChanged`. */
const MENU_DRAWN_FROM_KEY = "bookmark_menu_drawn_from";

/** Only pages worth keeping a link to; the menu stays out of the way everywhere else. */
const BOOKMARKABLE_PATTERNS = ["http://*/*", "https://*/*"];

/** How long the tick stays on the toolbar icon after a link was saved from the menu. */
const SAVED_BADGE_MILLIS = 2_000;

/** Green, as the colour of "done" - the badge's default red reads as an error. */
const SAVED_BADGE_COLOR = "#2e7d32";

/**
 *  Rebuilds run one after another: `removeAll` and `create` are asynchronous, and two
 *  rebuilds interleaved would each create entries the other already has.
 */
let menuQueue: Promise<void> = Promise.resolve();

/**
 *  Saves run one after another too: each reads the profile, adds a link and writes it back,
 *  and two clicks in quick succession would otherwise each write over the other's link.
 */
let saveQueue: Promise<void> = Promise.resolve();

/** What the menu shows, compared between rebuilds. */
interface MenuSource {
    language: string;
    workspaceName: string | null;
    groups: BookmarkMenuGroup[];
}

/**
 *  Registers the right-click entries and what they do. Call once, from the worker's top level.
 *
 *  The entries themselves are created on installation rather than here: Chrome stores them
 *  and brings them back with the worker, so creating them on every wake would fail on the
 *  identifier being taken. They are created again when the device's language changes or the
 *  groups of the open workspace do, which are the only other things that alter them.
 */
export function registerBookmarkContextMenu(): void {

    chrome.runtime.onInstalled.addListener(() => {
        enqueueRebuild(true);
    });

    // Watched here rather than pushed from the pages: a change can be made in one browser
    // window while the worker is asleep, and storage is what both of them agree about.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changesMenu(Object.keys(changes))) {
            enqueueRebuild(false);
        }
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        menuItemClicked(info, tab)
            .catch(error => LOG.error("menuItemClicked", error));
    });
}

/**
 *  Whether a write can have changed what the menu shows: the language, which profile is
 *  active, or a profile's data. Which profile's data is not worth deciding here - the
 *  comparison of trees in `rebuildMenuItemsIfChanged` does that for free.
 */
function changesMenu(keys: string[]): boolean {
    return keys.some(key => key === DEVICE_PREFERENCES_KEY
        || key === PROFILE_REGISTRY_KEY
        || key.startsWith(APP_STATE_PREFIX));
}

function enqueueRebuild(always: boolean): void {
    menuQueue = menuQueue
        .then(() => rebuildMenuItemsIfChanged(always))
        .catch(error => LOG.error("rebuildMenuItems", error));
}

/**
 *  Puts the entries back when what they show has changed - or always, on installation.
 *
 *  `removeAll` first, always: Chrome stores the entries and brings them back with the worker,
 *  so creating one whose identifier is already taken fails - and a rebuild that renames them
 *  would otherwise leave the old ones beside the new.
 */
async function rebuildMenuItemsIfChanged(always: boolean): Promise<void> {
    await adoptDeviceLanguage();
    const state = await readActiveProfileState();
    const source: MenuSource = {
        language: currentLanguage(),
        workspaceName: bookmarkMenuWorkspaceName(state),
        groups: bookmarkMenuTree(state)
    };

    const drawnFrom = (await chrome.storage.session.get(MENU_DRAWN_FROM_KEY))[MENU_DRAWN_FROM_KEY];
    const signature = JSON.stringify(source);
    if (!always && drawnFrom === signature) {
        return;
    }

    await chrome.contextMenus.removeAll();
    createMenuItems(source);
    await chrome.storage.session.set({ [MENU_DRAWN_FROM_KEY]: signature });
}

/**
 *  Reads the language this device is set to, since the worker inherits nothing.
 *
 *  A device that has never been asked - or a read that fails - leaves the browser's own
 *  language, which is what `setLanguage` does with nothing.
 */
async function adoptDeviceLanguage(): Promise<void> {
    try {
        const stored: Record<string, { language?: string } | undefined> =
            await chrome.storage.local.get(DEVICE_PREFERENCES_KEY);
        setLanguage(stored[DEVICE_PREFERENCES_KEY]?.language);
    } catch (error) {
        LOG.warn("adoptDeviceLanguage", String(error));
        setLanguage(null);
    }
}

/** The active profile's data, read straight from storage - the worker holds no state. */
async function readActiveProfileState(): Promise<AppState | null> {
    const activeProfileId = await readActiveProfileId();
    return activeProfileId ? storage.get<AppState>(appStateKey(activeProfileId)) : null;
}

async function readActiveProfileId(): Promise<string | null> {
    const registry = await storage.get<ProfileRegistry>(PROFILE_REGISTRY_KEY);
    return registry?.activeProfileId ?? null;
}

/** The two entries, named after the extension so the menu says who is doing the keeping. */
function createMenuItems(source: MenuSource): void {

    // The short name: the full one is the store title ("Tabilinks – grouped links on every
    // new tab"), and a menu entry reading "Bookmark this page with" all of that is a sentence.
    const manifest = chrome.runtime.getManifest();
    const extensionName = manifest.short_name ?? manifest.name;

    chrome.contextMenus.create({
        id: MENU_ITEM_PAGE,
        title: t("bookmark.contextMenu.page", { extension: extensionName }),
        // Everything but a link: right-clicking an image or a selection still means "this
        // page" to a user, and only a link means something else.
        contexts: ["page", "selection", "image", "video", "audio", "frame", "editable"],
        documentUrlPatterns: BOOKMARKABLE_PATTERNS
    });
    createTargetItems(MENU_ITEM_PAGE, source);

    chrome.contextMenus.create({
        id: MENU_ITEM_LINK,
        title: t("bookmark.contextMenu.link", { extension: extensionName }),
        contexts: ["link"],
        targetUrlPatterns: BOOKMARKABLE_PATTERNS
    });
    createTargetItems(MENU_ITEM_LINK, source);
}

/**
 *  The groups under one of the two entries, headed by the workspace they belong to, and the
 *  popup as the last choice.
 *
 *  The workspace's name is a disabled entry: it is not somewhere to put a link, only the
 *  answer to "which workspace are these groups from" - the menu is drawn ahead of time, and
 *  the workspace open on this device is whichever was open last, not necessarily the one the
 *  user has in mind.
 *
 *  A child inherits nothing from its parent - not the contexts, not the patterns - so each is
 *  created with `contexts: ["all"]` and is shown wherever its parent is. With no groups the
 *  parent is left childless, and a childless entry is itself clickable: it opens the popup.
 */
function createTargetItems(parentId: string, source: MenuSource): void {
    const groups = source.groups;
    if (groups.length === 0) {
        return;
    }

    if (source.workspaceName) {
        chrome.contextMenus.create({
            id: `${parentId}|workspace`,
            parentId,
            title: menuLabel(source.workspaceName),
            enabled: false,
            contexts: ["all"]
        });
        createSeparator(parentId, `${parentId}|workspace-separator`);
    }

    for (const group of groups) {
        const groupItemId = targetMenuItemId(parentId, { groupId: group.id });

        if (group.subgroups.length === 0) {
            createChild(parentId, groupItemId, group.title);
            continue;
        }

        // A group with subgroups is a submenu, and a submenu cannot be clicked - so the group's
        // own root level is its first entry.
        const submenuId = `${groupItemId}|menu`;
        createChild(parentId, submenuId, group.title);
        createChild(submenuId, groupItemId, t("bookmark.contextMenu.groupItself", { group: group.title }));
        createSeparator(submenuId, `${submenuId}|separator`);
        for (const subgroup of group.subgroups) {
            createChild(
                submenuId,
                targetMenuItemId(parentId, { groupId: group.id, subgroupId: subgroup.id }),
                subgroup.title);
        }
    }

    createSeparator(parentId, `${parentId}|separator`);
    createChild(parentId, parentId + CHOOSE_SUFFIX, t("bookmark.contextMenu.choose"));
}

function createChild(parentId: string, id: string, title: string): void {
    chrome.contextMenus.create({ id, parentId, title: menuLabel(title), contexts: ["all"] });
}

function createSeparator(parentId: string, id: string): void {
    chrome.contextMenus.create({ id, parentId, type: "separator", contexts: ["all"] });
}

/**
 *  A title as the menu should show it.
 *
 *  Firefox reads a single "&" as marking the access key, so "News & Media" would lose its
 *  ampersand and underline the space; doubled, it is shown as it is. Chrome shows a doubled
 *  one doubled, so it is left alone there.
 */
function menuLabel(title: string): string {
    const label = title.trim() || "—";
    return navigator.userAgent.includes("Firefox") ? label.replace(/&/g, "&&") : label;
}

/**
 *  Saves into the chosen group, or opens the form, on whichever entry was chosen.
 *
 *  A link has no title to offer - the text it was drawn with is in the page, which the worker
 *  cannot read - so it is saved under its address, which is what the form does with an empty
 *  name too.
 */
async function menuItemClicked(
    info: chrome.contextMenus.OnClickData,
    tab: chrome.tabs.Tab | undefined
): Promise<void> {

    const menuItemId = String(info.menuItemId);
    const menu = menuItemId.startsWith(MENU_ITEM_LINK) ? MENU_ITEM_LINK
        : menuItemId.startsWith(MENU_ITEM_PAGE) ? MENU_ITEM_PAGE
        : null;
    if (!menu) {
        return;
    }

    const request = requestFor(menu, info, tab);
    if (!request) {
        return;
    }

    const target = targetOfMenuItem(menu, menuItemId);
    if (!target) {
        // The entry itself (no groups to offer) or "Choose a place…".
        await openFormFor(request);
        return;
    }

    const saved = new Promise<boolean>(resolve => {
        saveQueue = saveQueue
            .then(() => saveInto(target, request))
            .then(resolve, error => {
                LOG.error("saveInto", error);
                resolve(false);
            });
    });

    if (await saved) {
        await showSaved(tab?.id);
    } else {
        await openFormFor(request);
    }
}

/** What is being kept: the link right-clicked, or the page it was right-clicked on. */
function requestFor(
    menu: string,
    info: chrome.contextMenus.OnClickData,
    tab: chrome.tabs.Tab | undefined
): BookmarkRequest | null {

    if (menu === MENU_ITEM_LINK) {
        return isBookmarkableUrl(info.linkUrl) ? { url: info.linkUrl, title: "" } : null;
    }

    if (!tab || !isBookmarkableUrl(tab.url)) {
        // chrome://, the extension's own pages, a blank tab - nothing to keep a link to.
        LOG.debug("menuItemClicked", `Nothing bookmarkable in ${tab?.url ?? "that tab"}`);
        return null;
    }
    return { url: tab.url, title: tab.title ?? "", favIconUrl: tab.favIconUrl };
}

/**
 *  Stores the link in the active profile, through the same repository and checks the popup
 *  uses - positions, the workspace a link names, the links limit.
 *
 *  A repository of its own on every save, loaded from storage at that moment: the menu may
 *  have been drawn long ago, the worker holds nothing between events, and a new tab page may
 *  have changed the profile a second ago.
 *
 *  Nothing is synchronised from here, exactly as nothing is from the popup: the write moves
 *  the stored profile on, and an open new tab page adopts it and pushes the difference.
 *
 *  @return whether the link was stored; false sends the user to the form, which can say why
 */
export async function saveInto(target: BookmarkMenuTarget, request: BookmarkRequest): Promise<boolean> {
    const activeProfileId = await readActiveProfileId();
    if (!activeProfileId || !await storage.get<AppState>(appStateKey(activeProfileId))) {
        return false;
    }

    const appState = new AppStateRepository();
    await appState.init(appStateInit, activeProfileId);

    // The menu is drawn ahead of time, so what it offered may be gone by the time it is used.
    const state = appState.state$.get();
    if (!state.groups[target.groupId]
        || (target.subgroupId && state.subgroups[target.subgroupId]?.groupId !== target.groupId)) {
        LOG.warn("saveInto", "The chosen group or subgroup no longer exists");
        return false;
    }

    const title = request.title.trim() || request.url;
    const refusal = await new BookmarkViewModel(appState)
        .save(request.url, title, target.groupId, target.subgroupId);
    return refusal === null;
}

/** A tick on the toolbar icon of the tab the link came from, for a moment. */
async function showSaved(tabId: number | undefined): Promise<void> {
    try {
        await chrome.action.setBadgeBackgroundColor({ color: SAVED_BADGE_COLOR, tabId });
        await chrome.action.setBadgeText({ text: "✓", tabId });
        setTimeout(() => {
            chrome.action.setBadgeText({ text: "", tabId })
                .catch(error => LOG.debug("showSaved", String(error)));
        }, SAVED_BADGE_MILLIS);
    } catch (error) {
        // The tab may have closed in the meantime; the link is stored either way.
        LOG.debug("showSaved", String(error));
    }
}

/**
 *  Leaves the request where the popup will find it, and opens the popup.
 *
 *  The request is stored first: the popup starts reading as soon as it is asked for, and a
 *  request written afterwards would arrive too late to be seen.
 */
async function openFormFor(request: BookmarkRequest): Promise<void> {

    await storePendingBookmark(request);

    try {
        await chrome.action.openPopup();
    } catch (error) {
        // The browser refuses when no window is focused, and says so rather than opening
        // something the user did not ask for. Nothing is left half-done: the request expires
        // on its own, and the toolbar icon still opens the form.
        LOG.warn("openFormFor", `Could not open the popup: ${String(error)}`);
    }
}
