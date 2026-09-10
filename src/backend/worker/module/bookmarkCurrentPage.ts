import {
    BookmarkRequest,
    buildBookmarkPageUrl,
    BOOKMARK_PAGE,
    isBookmarkableUrl
} from "../../../utils/bookmarkRequest";
import { Logger } from "../../../utils/logger";

/**
 *  Bookmarking a page, from the keyboard or from the right-click menu.
 *
 *  Both ways in are browser events rather than requests from a page, so this is an event
 *  listener module like the tab group catcher: everything has to be registered during the
 *  worker's own evaluation, because that is what Chrome restarts a stopped worker for.
 *
 *  What the worker cannot do is show the form. It has no DOM, and drawing the form on the
 *  visited site would mean injecting a script into every page the user opens, which is
 *  exactly the permission this feature was meant to avoid. So it reads the tab and opens the
 *  extension's own small window on `bookmark.html`, handing over the details in the address.
 *
 *  **The shortcut cannot be relied on.** A browser keeps its own shortcuts for itself, and
 *  Ctrl+Shift+D is one of them in Chrome and Brave alike - it bookmarks every open tab. A
 *  suggested key a browser refuses simply leaves the command unbound, silently, and the
 *  feature would then appear not to exist. That is why the right-click menu is here: it is
 *  the way in that nothing else can take, and the shortcut is the accelerator for it.
 */

const LOG = new Logger("BookmarkCurrentPage");

/** Name of the command, as declared in the manifest. */
export const COMMAND_BOOKMARK_CURRENT_PAGE = "bookmark-current-page";

/** Right-click on the page itself: keep the page. */
const MENU_ITEM_PAGE = "bookmark-page";

/** Right-click on a link: keep where that link goes, not the page it sits on. */
const MENU_ITEM_LINK = "bookmark-link";

/** Only pages worth keeping a link to; the menu stays out of the way everywhere else. */
const BOOKMARKABLE_PATTERNS = ["http://*/*", "https://*/*"];

/** Size of the window the form is drawn in; the form is fixed-width and short. */
const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 420;

/** Registers the command listener. Call once, from the service worker's top level. */
export function registerBookmarkCommand(): void {
    chrome.commands.onCommand.addListener(command => {
        if (command !== COMMAND_BOOKMARK_CURRENT_PAGE) {
            return;
        }
        bookmarkActiveTab()
            .catch(error => LOG.error("bookmarkActiveTab", error));
    });
}

/**
 *  Registers the right-click entries and what they do. Call once, from the worker's top level.
 *
 *  The entries themselves are created on installation rather than here: Chrome stores them
 *  and brings them back with the worker, so creating them on every wake would fail on the
 *  identifier being taken. `removeAll` first, so an update that renames or re-arranges them
 *  does not leave the old ones behind.
 */
export function registerBookmarkContextMenu(): void {

    chrome.runtime.onInstalled.addListener(() => {
        chrome.contextMenus.removeAll(() => createMenuItems());
    });

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        menuItemClicked(info, tab)
            .catch(error => LOG.error("menuItemClicked", error));
    });
}

/** The two entries, named after the extension so the menu says who is doing the keeping. */
function createMenuItems(): void {

    const extensionName = chrome.runtime.getManifest().name;

    chrome.contextMenus.create({
        id: MENU_ITEM_PAGE,
        title: `Bookmark this page with ${extensionName}`,
        // Everything but a link: right-clicking an image or a selection still means "this
        // page" to a user, and only a link means something else.
        contexts: ["page", "selection", "image", "video", "audio", "frame", "editable"],
        documentUrlPatterns: BOOKMARKABLE_PATTERNS
    });

    chrome.contextMenus.create({
        id: MENU_ITEM_LINK,
        title: `Bookmark this link with ${extensionName}`,
        contexts: ["link"],
        targetUrlPatterns: BOOKMARKABLE_PATTERNS
    });
}

/**
 *  Opens the form on whichever of the two entries was chosen.
 *
 *  A link has no title to offer - the text it was drawn with is in the page, which the worker
 *  cannot read - so the form opens with an empty name, and saving it as it stands keeps the
 *  address as the name.
 */
async function menuItemClicked(
    info: chrome.contextMenus.OnClickData,
    tab: chrome.tabs.Tab | undefined
): Promise<void> {

    if (info.menuItemId === MENU_ITEM_LINK) {
        if (!isBookmarkableUrl(info.linkUrl)) {
            return;
        }
        await openBookmarkWindow({ url: info.linkUrl, title: "" });
        return;
    }

    if (info.menuItemId !== MENU_ITEM_PAGE) {
        return;
    }

    // The clicked tab is the page in question; falling back to the active one covers a click
    // that arrives without it, which is what a frame in an odd state can produce.
    await bookmarkTab(tab ?? await activeTab());
}

/** Opens the form on the tab the user is looking at. */
async function bookmarkActiveTab(): Promise<void> {
    await bookmarkTab(await activeTab());
}

/** Opens the form on one tab, if there is anything about it worth keeping. */
async function bookmarkTab(tab: chrome.tabs.Tab | undefined): Promise<void> {

    if (!tab || !isBookmarkableUrl(tab.url)) {
        // chrome://, the extension's own pages, a blank tab - nothing to keep a link to.
        LOG.debug("bookmarkTab", `Nothing bookmarkable in ${tab?.url ?? "the active tab"}`);
        return;
    }

    await openBookmarkWindow({
        url: tab.url,
        title: tab.title ?? "",
        favIconUrl: tab.favIconUrl
    });
}

/**
 *  Shows the bookmarking form for one page.
 *
 *  A window already showing the form is reused rather than joined by a second one: asking
 *  again means "bookmark this one instead", not "give me another form".
 */
async function openBookmarkWindow(request: BookmarkRequest): Promise<void> {

    const pageUrl = buildBookmarkPageUrl(request);
    const existing = await existingBookmarkTab();

    if (existing?.id !== undefined) {
        await chrome.tabs.update(existing.id, { url: pageUrl, active: true });
        if (existing.windowId !== undefined) {
            await chrome.windows.update(existing.windowId, { focused: true });
        }
        return;
    }

    await chrome.windows.create({
        url: pageUrl,
        type: "popup",
        width: POPUP_WIDTH,
        height: POPUP_HEIGHT,
        focused: true
    });
}

/** The tab the user is looking at, or undefined when there is none to speak of. */
async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
    // lastFocusedWindow rather than currentWindow: the worker has no window of its own, and
    // "current" from here is whichever window last ran extension code.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab;
}

/** A window already showing the form, if it was asked for twice. */
async function existingBookmarkTab(): Promise<chrome.tabs.Tab | undefined> {
    const [tab] = await chrome.tabs.query({ url: `${chrome.runtime.getURL(BOOKMARK_PAGE)}*` });
    return tab;
}
