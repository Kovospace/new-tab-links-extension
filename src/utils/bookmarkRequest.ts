import { PENDING_BOOKMARK_KEY } from "../backend/datasource/chromeStorage/storageKeys";

/**
 *  What the service worker tells the bookmarking popup about the page to keep.
 *
 *  The popup is the browser's own bubble, opened from the toolbar icon, the keyboard shortcut
 *  or `chrome.action.openPopup()`. None of those carry an argument - the popup's address is
 *  fixed in the manifest - so the worker leaves the request where the popup will look for it
 *  and opens the popup, and the popup takes it from there.
 *
 *  **Session storage, not local.** A request is a few seconds of intent, not data: it must not
 *  survive a browser restart and be answered days later. It is taken rather than read, so it
 *  is answered once, and it is stamped so that one left behind by a popup the user dismissed
 *  is not picked up by the next.
 *
 *  A popup opened from the toolbar icon finds nothing here, which is not an error: it means
 *  "the page I am standing on", and the popup asks the browser for that itself.
 */

/** The details of the page being bookmarked, as the form needs them. */
export interface BookmarkRequest {

    /** The address of the page. Always http(s) - see `isBookmarkableUrl`. */
    url: string;

    /** The page's title, which pre-fills the name; may be empty. */
    title: string;

    /** The tab's own favicon, when Chrome had one for it. */
    favIconUrl?: string;
}

/** A request, and when it was made. */
interface PendingBookmark extends BookmarkRequest {
    at: number;
}

/**
 *  How long a request stays answerable.
 *
 *  Long enough for the popup to open and read it, short enough that one left behind - the
 *  popup refused to open, or was dismissed before it loaded - is never answered later, when
 *  the user is looking at something else entirely.
 */
const PENDING_LIFETIME = 15_000;

/**
 *  Whether a page can be bookmarked at all.
 *
 *  Only http(s) is offered. `chrome://`, `file://`, `about:` and the extension's own pages
 *  are not links a user keeps in a workspace, and the new tab page - which is where the
 *  shortcut is most likely to be pressed by accident - is one of them.
 */
export function isBookmarkableUrl(url: string | undefined): url is string {
    if (!url) {
        return false;
    }
    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:";
    } catch {
        return false;
    }
}

/** Leaves a request for the popup that is about to open. */
export async function storePendingBookmark(request: BookmarkRequest): Promise<void> {
    const pending: PendingBookmark = { ...request, at: Date.now() };
    await chrome.storage.session.set({ [PENDING_BOOKMARK_KEY]: pending });
}

/**
 *  Takes the request the worker left, if there is one worth answering.
 *
 *  Taken, not read: the request is removed whether or not it is still fresh, so it cannot be
 *  answered twice or inherited by a later popup.
 *
 *  @return the page to bookmark, or null when the popup was opened without one - which is
 *          what clicking the toolbar icon does
 */
export async function takePendingBookmark(): Promise<BookmarkRequest | null> {

    const stored = await chrome.storage.session.get(PENDING_BOOKMARK_KEY);
    const pending = stored[PENDING_BOOKMARK_KEY] as PendingBookmark | undefined;

    if (pending) {
        await chrome.storage.session.remove(PENDING_BOOKMARK_KEY);
    }

    if (!pending
        || !isBookmarkableUrl(pending.url)
        || Date.now() - pending.at > PENDING_LIFETIME) {
        return null;
    }

    return { url: pending.url, title: pending.title, favIconUrl: pending.favIconUrl };
}

/**
 *  The tab the popup is standing on, as a request.
 *
 *  This is what the toolbar icon and the keyboard shortcut mean: the popup opens over the
 *  page the user is looking at, and that page is what they want kept.
 *
 *  @return the active tab as a request, or null when it is not something to keep a link to
 */
export async function requestForActiveTab(): Promise<BookmarkRequest | null> {

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !isBookmarkableUrl(tab.url)) {
        return null;
    }

    return { url: tab.url, title: tab.title ?? "", favIconUrl: tab.favIconUrl };
}
