import { buildBookmarkPageUrl, BOOKMARK_PAGE, isBookmarkableUrl } from "../../../utils/bookmarkRequest";
import { Logger } from "../../../utils/logger";

/**
 *  Bookmarking the page the user is looking at, from a keyboard shortcut.
 *
 *  The shortcut is declared in the manifest under `commands` and arrives here as an event.
 *  Like the tab group catcher this is an event listener rather than a request/response
 *  module: nothing in the page asks for it, the browser does, so it has to be registered
 *  during the worker's own evaluation - that is what Chrome restarts a stopped worker for.
 *
 *  What the worker cannot do is show the form. It has no DOM, and drawing the form on the
 *  visited site would mean injecting a script into every page the user opens, which is
 *  exactly the permission this feature was meant to avoid. So it reads the tab and opens the
 *  extension's own small window on `bookmark.html`, handing over the details in the address.
 *
 *  Chrome may refuse the suggested key when another extension already holds it, and never
 *  overrides its own reserved shortcuts. The command still works - it is simply unbound, and
 *  the user can give it a key at chrome://extensions/shortcuts.
 */

const LOG = new Logger("BookmarkCurrentPage");

/** Name of the command, as declared in the manifest. */
export const COMMAND_BOOKMARK_CURRENT_PAGE = "bookmark-current-page";

/** Size of the window the form is drawn in; the form is fixed-width and short. */
const POPUP_WIDTH = 560;
const POPUP_HEIGHT = 420;

/** Registers the command listener. Call once, from the service worker's top level. */
export function registerBookmarkCommand(): void {
    chrome.commands.onCommand.addListener(command => {
        if (command !== COMMAND_BOOKMARK_CURRENT_PAGE) {
            return;
        }
        openBookmarkWindow()
            .catch(error => LOG.error("openBookmarkWindow", error));
    });
}

/**
 *  Opens the bookmarking form for the tab the user is looking at.
 *
 *  A window already showing the form is reused rather than joined by a second one: pressing
 *  the shortcut again means "bookmark this page instead", not "give me another form".
 */
async function openBookmarkWindow(): Promise<void> {

    const tab = await activeTab();

    if (!tab || !isBookmarkableUrl(tab.url)) {
        // chrome://, the extension's own pages, a blank tab - nothing to keep a link to.
        LOG.debug("openBookmarkWindow", `Nothing bookmarkable in ${tab?.url ?? "the active tab"}`);
        return;
    }

    const pageUrl = buildBookmarkPageUrl({
        url: tab.url,
        title: tab.title ?? "",
        favIconUrl: tab.favIconUrl
    });

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

/** A window already showing the form, if the shortcut was pressed twice. */
async function existingBookmarkTab(): Promise<chrome.tabs.Tab | undefined> {
    const [tab] = await chrome.tabs.query({ url: `${chrome.runtime.getURL(BOOKMARK_PAGE)}*` });
    return tab;
}
