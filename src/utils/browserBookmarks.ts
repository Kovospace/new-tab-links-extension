import { BookmarkNode } from "../viewModel/bookmarkImport";

/**
 *  The browser's own bookmarks, for importing them (#182).
 *
 *  `bookmarks` is an **optional** permission (`optional_permissions` in the manifest), asked
 *  for when the user presses "Import bookmarks" and at no other time. Required, it would be
 *  one more line in the install prompt for something most people do once. And an update that
 *  adds a required permission is disabled by Chrome until the user accepts it.
 *
 *  `chrome.permissions.request` has to be called while the click that asked for it is still
 *  being handled, Firefox being the stricter of the two. So nothing may be awaited before it:
 *  the caller goes straight here from the button.
 */
const BOOKMARKS_PERMISSION: chrome.permissions.Permissions = { permissions: ["bookmarks"] };

/** Asks for the bookmarks permission, unless it was granted before. Resolves to whether it is held. */
export async function requestBookmarksAccess(): Promise<boolean> {
    try {
        return await chrome.permissions.request(BOOKMARKS_PERMISSION);
    } catch {
        // Refused outright, for one when no click is being handled: the same as a "no".
        return false;
    }
}

/** The whole bookmark tree, as the browser holds it. Needs the permission. */
export async function readBookmarkTree(): Promise<BookmarkNode[]> {
    return await chrome.bookmarks.getTree() as BookmarkNode[];
}
