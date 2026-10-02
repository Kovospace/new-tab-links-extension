/**
 *  The extension's keyboard shortcut for saving the current page, and where to change it.
 *
 *  **An extension cannot set its own shortcut in Chrome.** `chrome.commands` only reads them -
 *  Firefox has `commands.update`, Chrome has nothing like it - and the manifest's suggested key
 *  applies to a fresh install only. What the user can do is assign any combination they like,
 *  Ctrl+D included, on `chrome://extensions/shortcuts`; Chrome lets an extension's command take
 *  precedence over its own shortcuts except for a few it reserves, such as window management.
 *  So this helps them get there and says what is set now, which is all there is to do.
 */

/** Chrome's page for every extension's keyboard shortcuts. */
export const SHORTCUTS_PAGE = "chrome://extensions/shortcuts";

/**
 *  The command the shortcut runs: opening the toolbar popup, which is the bookmarking form.
 *  `_execute_action` is the browser's own name for it - see the manifest's `commands`.
 */
const BOOKMARK_COMMAND = "_execute_action";

/**
 *  What saving the current page is bound to, as Chrome writes it ("Alt+Shift+D").
 *
 *  @return the shortcut, or null when none is set - which is also the answer when the key the
 *          manifest suggested was already taken by another extension at install time
 */
export async function readBookmarkShortcut(): Promise<string | null> {
    try {
        const commands = await chrome.commands.getAll();
        const shortcut = commands.find(command => command.name === BOOKMARK_COMMAND)?.shortcut;
        return shortcut ? shortcut : null;
    } catch {
        return null;
    }
}

/**
 *  Opens Chrome's shortcuts page in a new tab.
 *
 *  Through `chrome.tabs`, because an ordinary link to a chrome:// address is refused - an
 *  extension page may open one only this way.
 */
export function openShortcutsPage(): void {
    void chrome.tabs.create({ url: SHORTCUTS_PAGE });
}
