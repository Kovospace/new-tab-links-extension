/**
 *  What the service worker tells the bookmark page about the page being bookmarked.
 *
 *  The keyboard shortcut is caught in the service worker, which is the only place that can
 *  see the tab the user is looking at, while the form has to be drawn by a page - a worker
 *  has no DOM, and putting the form on the visited site itself would mean injecting into
 *  every page the user opens. So the worker opens an extension page and hands it the tab's
 *  details in the address, the way it would hand them to any other window.
 *
 *  Kept here, beside `sendToWorker`, because both ends of that handover need it: the worker
 *  builds the address, the page reads it back.
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

/** The extension page that draws the bookmarking form. */
export const BOOKMARK_PAGE = "bookmark.html";

const PARAM_URL = "url";
const PARAM_TITLE = "title";
const PARAM_ICON = "icon";

/**
 *  How long a favicon address may be before it is dropped from the handover.
 *
 *  A tab's favicon is usually an ordinary address, but a page is free to declare it as a
 *  `data:` URI holding the whole image, and those run to tens of kilobytes. The page can ask
 *  the favicon worker for an icon by itself, so an oversized one is simply left out rather
 *  than carried through the address bar.
 */
const MAX_FAVICON_URL_LENGTH = 2048;

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

/** The address of the bookmark page, carrying the details of the page to bookmark. */
export function buildBookmarkPageUrl(request: BookmarkRequest): string {
    const params = new URLSearchParams();
    params.set(PARAM_URL, request.url);
    params.set(PARAM_TITLE, request.title);
    if (request.favIconUrl && request.favIconUrl.length <= MAX_FAVICON_URL_LENGTH) {
        params.set(PARAM_ICON, request.favIconUrl);
    }
    return `${chrome.runtime.getURL(BOOKMARK_PAGE)}?${params.toString()}`;
}

/**
 *  Reads back what the worker put in the address.
 *
 *  @param search  `window.location.search` of the bookmark page
 *  @return the page to bookmark, or null when the address names nothing bookmarkable - which
 *          is what someone opening the page by hand would produce
 */
export function readBookmarkRequest(search: string): BookmarkRequest | null {

    const params = new URLSearchParams(search);
    const url = params.get(PARAM_URL);

    if (!isBookmarkableUrl(url ?? undefined)) {
        return null;
    }

    return {
        url: url!,
        title: params.get(PARAM_TITLE) ?? "",
        favIconUrl: params.get(PARAM_ICON) ?? undefined
    };
}
