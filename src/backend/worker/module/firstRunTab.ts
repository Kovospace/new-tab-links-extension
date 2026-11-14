import { Logger } from "../../../utils/logger";

const LOG = new Logger("firstRunTab");

/**
 *  Opens a new tab once, when the extension is installed, so the first thing a new user sees
 *  is the first-run screen rather than a toolbar icon to guess at (#172). That icon opens the
 *  bookmarking popup, and clicking it first is what made people think the extension was only
 *  a bookmark form.
 *
 *  Only on `install`: an update or a browser update is not a reason to open anything. A new tab
 *  is ours - the manifest overrides it - so no address is needed. Call once, from the worker's
 *  top level.
 */
export function registerFirstRunTab(): void {
    chrome.runtime.onInstalled.addListener(details => {
        if (details.reason !== "install") {
            return;
        }
        chrome.tabs.create({})
            .catch(error => LOG.error("open the first-run tab", error));
    });
}
