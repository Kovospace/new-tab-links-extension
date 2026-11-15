import {
    BookmarkRequest,
    isBookmarkableUrl,
    storePendingBookmark,
    storePendingNotice
} from "../../../utils/bookmarkRequest";
import { flashSave, FlashSaveOutcome } from "./flashSave";
import { ContextMenuMode, normalizeContextMenuMode } from "../../repository/DevicePreferencesRepository";
import { FLASH_SAVE_COMMAND } from "../../../utils/extensionShortcuts";
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
 *  **One "Tabilinks" entry, three actions** (#204), for the page or - right-clicked on a link -
 *  for the link. Only one of the two entries is ever shown, so Chrome draws it as it is rather
 *  than folding it into a submenu under the extension's long store name:
 *  - **Flash save**, first: kept there and then, in the open workspace's "Flash save" group,
 *    made the first time (`flashSave.ts`). Its keyboard shortcut (`flash-save`) needs no menu.
 *  - **Add bookmark…**: the popup with the form, filled in.
 *  - **Save to group ▸**: the open workspace's groups, a group holding subgroups a submenu of its
 *    own. Choosing one saves there and then, with nothing to fill in.
 *  A save from the menu shows a tick on the toolbar icon. One that cannot be made - a group
 *  deleted since the menu was drawn, a full workspace - falls back to the popup, which can say why.
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

/** The three actions under each entry (#204). */
const FLASH_SUFFIX = "|flash";
const FORM_SUFFIX = "|form";
const GROUPS_SUFFIX = "|groups";



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
    /** The three actions, or Flash save alone at the menu's root (#204). */
    mode: ContextMenuMode;
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

    // Flash save without the menu (#204): the page in the active tab, from a keyboard shortcut.
    chrome.commands.onCommand.addListener((command, tab) => {
        if (command !== FLASH_SAVE_COMMAND) {
            return;
        }
        flashSaveActiveTab(tab)
            .catch(error => LOG.error("flashSaveActiveTab", error));
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
    const mode = await readMenuPreferences();
    const state = await readActiveProfileState();
    const source: MenuSource = {
        language: currentLanguage(),
        mode,
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
 *  Reads what the menu depends on in this device's preferences, since the worker inherits
 *  nothing: the language, which is put in force, and what the menu offers (#204), returned.
 *
 *  A device that has never been asked - or a read that fails - leaves the browser's own
 *  language, which is what `setLanguage` does with nothing, and the standard menu.
 */
async function readMenuPreferences(): Promise<ContextMenuMode> {
    try {
        const stored: Record<string, { language?: string; contextMenuMode?: string } | undefined> =
            await chrome.storage.local.get(DEVICE_PREFERENCES_KEY);
        setLanguage(stored[DEVICE_PREFERENCES_KEY]?.language);
        // What the menu offers is this device's choice too (#204), read with the language.
        return normalizeContextMenuMode(stored[DEVICE_PREFERENCES_KEY]?.contextMenuMode);
    } catch (error) {
        LOG.warn("readMenuPreferences", String(error));
        setLanguage(null);
        return normalizeContextMenuMode(null);
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

/**
 *  The two entries - the page, a link - each called by the extension's short name and holding
 *  the three actions. Only one of the two is shown on any right-click, which is what keeps
 *  Chrome from folding them into a submenu named after the store title.
 */
function createMenuItems(source: MenuSource): void {

    // The short name: the full one is the store title, far too long for a menu entry.
    const manifest = chrome.runtime.getManifest();
    const extensionName = manifest.short_name ?? manifest.name;

    if (source.mode === "flashSave") {
        createFlashSaveOnly(extensionName);
        return;
    }

    chrome.contextMenus.create({
        id: MENU_ITEM_PAGE,
        title: menuLabel(extensionName),
        // Everything but a link: right-clicking an image or a selection still means "this
        // page" to a user, and only a link means something else.
        contexts: ["page", "selection", "image", "video", "audio", "frame", "editable"],
        documentUrlPatterns: BOOKMARKABLE_PATTERNS
    });
    createActionItems(MENU_ITEM_PAGE, source, "page");

    chrome.contextMenus.create({
        id: MENU_ITEM_LINK,
        title: menuLabel(extensionName),
        contexts: ["link"],
        targetUrlPatterns: BOOKMARKABLE_PATTERNS
    });
    createActionItems(MENU_ITEM_LINK, source, "link");
}

/**
 *  Fast-paced link grabbing (#204; Settings → UI and behavior): Flash save alone, straight in
 *  the menu - one entry per kind of click, so Chrome folds nothing into a submenu. Named with
 *  the extension, since nothing around it says whose it is. The same identifiers as under the
 *  "Tabilinks" entry, so a click is handled the same way.
 */
function createFlashSaveOnly(extensionName: string): void {
    chrome.contextMenus.create({
        id: MENU_ITEM_PAGE + FLASH_SUFFIX,
        title: menuLabel(t("bookmark.contextMenu.flashSaveAlone.page", { extension: extensionName })),
        contexts: ["page", "selection", "image", "video", "audio", "frame", "editable"],
        documentUrlPatterns: BOOKMARKABLE_PATTERNS
    });
    chrome.contextMenus.create({
        id: MENU_ITEM_LINK + FLASH_SUFFIX,
        title: menuLabel(t("bookmark.contextMenu.flashSaveAlone.link", { extension: extensionName })),
        contexts: ["link"],
        targetUrlPatterns: BOOKMARKABLE_PATTERNS
    });
}

/**
 *  Flash save, Add bookmark… and Save to group ▸ under one entry (#204). Flash save is first,
 *  where the pointer lands when the submenu opens, so it costs the one click.
 *
 *  A child inherits nothing from its parent - not the contexts, not the patterns - so each is
 *  created with `contexts: ["all"]` and is shown wherever its parent is.
 */
function createActionItems(parentId: string, source: MenuSource, what: "page" | "link"): void {
    createChild(parentId, parentId + FLASH_SUFFIX, t(`bookmark.contextMenu.flashSave.${what}`));
    createChild(parentId, parentId + FORM_SUFFIX, t("bookmark.contextMenu.addBookmark"));

    const groupsId = parentId + GROUPS_SUFFIX;
    chrome.contextMenus.create({
        id: groupsId,
        parentId,
        title: menuLabel(t("bookmark.contextMenu.saveToGroup")),
        // Nothing to choose from yet: there, but greyed out, so the menu keeps its shape.
        enabled: source.groups.length > 0,
        contexts: ["all"]
    });
    createTargetItems(parentId, groupsId, source);
}

/**
 *  The groups under "Save to group" - the open workspace's - and nothing else in it. There used
 *  to be a greyed-out heading naming the workspace, and it read as a group that could not be
 *  chosen (#204), so every entry in the submenu is now something to save into.
 *
 *  @param prefix   the entry the identifiers are minted under, which says page or link
 *  @param parentId the "Save to group" submenu
 */
function createTargetItems(prefix: string, parentId: string, source: MenuSource): void {
    const groups = source.groups;
    if (groups.length === 0) {
        return;
    }

    for (const group of groups) {
        const groupItemId = targetMenuItemId(prefix, { groupId: group.id });

        if (group.subgroups.length === 0) {
            createChild(parentId, groupItemId, group.title);
            continue;
        }

        // A group with subgroups is a submenu: the group itself first, then its subgroups.
        const submenuId = `${groupItemId}|menu`;
        createChild(parentId, submenuId, group.title);
        createChild(submenuId, groupItemId, t("bookmark.contextMenu.groupItself", { group: group.title }));
        createSeparator(submenuId, `${submenuId}|separator`);
        for (const subgroup of group.subgroups) {
            createChild(
                submenuId,
                targetMenuItemId(prefix, { groupId: group.id, subgroupId: subgroup.id }),
                subgroup.title);
        }
    }
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

    if (menuItemId === menu + FLASH_SUFFIX) {
        await flashSaveAndSay(request, tab?.id);
        return;
    }
    if (menuItemId === menu + FORM_SUFFIX) {
        await openFormFor(request);
        return;
    }
    const target = targetOfMenuItem(menu, menuItemId);
    if (!target) {
        return;     // The entry itself, the "Save to group" heading, the workspace's name.
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

/** Flash-saves the page in the tab the shortcut was pressed on; anything not a web page is left alone. */
async function flashSaveActiveTab(tab: chrome.tabs.Tab | undefined): Promise<void> {
    const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!active || !isBookmarkableUrl(active.url)) {
        LOG.debug("flashSaveActiveTab", `Nothing to keep in ${active?.url ?? "that tab"}`);
        return;
    }
    await flashSaveAndSay({ url: active.url, title: active.title ?? "", favIconUrl: active.favIconUrl }, active.id);
}

/**
 *  Flash-saves, queued behind any other save, and says how it went: a tick on the toolbar icon;
 *  the popup's form when there is no workspace to save into (it can make one); the popup with a
 *  notice when a limit refused it - a workspace with no room for the "Flash save" group says so.
 */
async function flashSaveAndSay(request: BookmarkRequest, tabId: number | undefined): Promise<void> {
    const outcome = await new Promise<FlashSaveOutcome | null>(resolve => {
        saveQueue = saveQueue
            .then(() => flashSave(request))
            .then(resolve, error => {
                LOG.error("flashSave", error);
                resolve(null);
            });
    });

    if (outcome?.kind === "saved") {
        await showSaved(tabId);
    } else if (outcome?.kind === "refused") {
        await storePendingNotice({ title: outcome.title, message: outcome.message });
        await openPopup();
    } else {
        await openFormFor(request);
    }
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
    await openPopup();
}

/** Opens the action popup, which reads whatever was left for it in session storage. */
async function openPopup(): Promise<void> {
    try {
        await chrome.action.openPopup();
    } catch (error) {
        // The browser refuses when no window is focused, and says so rather than opening
        // something the user did not ask for. Nothing is left half-done: the request expires
        // on its own, and the toolbar icon still opens the form.
        LOG.warn("openPopup", `Could not open the popup: ${String(error)}`);
    }
}
