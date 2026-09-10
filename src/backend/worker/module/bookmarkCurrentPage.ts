import {
    BookmarkRequest,
    isBookmarkableUrl,
    storePendingBookmark
} from "../../../utils/bookmarkRequest";
import { Logger } from "../../../utils/logger";

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
 */

const LOG = new Logger("BookmarkCurrentPage");

/** Right-click on the page itself: keep the page. */
const MENU_ITEM_PAGE = "bookmark-page";

/** Right-click on a link: keep where that link goes, not the page it sits on. */
const MENU_ITEM_LINK = "bookmark-link";

/** Only pages worth keeping a link to; the menu stays out of the way everywhere else. */
const BOOKMARKABLE_PATTERNS = ["http://*/*", "https://*/*"];

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
        await openFormFor({ url: info.linkUrl, title: "" });
        return;
    }

    if (info.menuItemId !== MENU_ITEM_PAGE) {
        return;
    }

    if (!tab || !isBookmarkableUrl(tab.url)) {
        // chrome://, the extension's own pages, a blank tab - nothing to keep a link to.
        LOG.debug("menuItemClicked", `Nothing bookmarkable in ${tab?.url ?? "that tab"}`);
        return;
    }

    await openFormFor({
        url: tab.url,
        title: tab.title ?? "",
        favIconUrl: tab.favIconUrl
    });
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
