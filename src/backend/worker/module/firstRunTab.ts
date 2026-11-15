import { Logger } from "../../../utils/logger";
import { BACKGROUND_DEFAULT_PENDING_KEY } from "../../datasource/chromeStorage/storageKeys";
import { ChromeStorageWrapper } from "../../datasource/chromeStorage/chromeStorageWrapper";

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
 *
 *  It also asks for the default background (#175) - asks, because a worker cannot download the
 *  picture into a data URL the way the page does (`BackgroundLibraryRepository.applyInstallDefault`).
 *  The request is stored before the tab opens, so the page that tab draws already finds it.
 */
export function registerFirstRunTab(): void {
    chrome.runtime.onInstalled.addListener(details => {
        if (details.reason !== "install") {
            return;
        }
        new ChromeStorageWrapper().save(BACKGROUND_DEFAULT_PENDING_KEY, true)
            .catch(error => LOG.error("ask for the default background", error))
            .then(() => chrome.tabs.create({}))
            .catch(error => LOG.error("open the first-run tab", error));
    });
}
