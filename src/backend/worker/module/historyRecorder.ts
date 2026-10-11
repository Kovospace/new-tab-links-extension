import type { ProfileRegistry } from "../../repository/ProfileRepository";
import { ChromeStorageWrapper } from "../../datasource/chromeStorage/chromeStorageWrapper";
import {
    INSTALLATION_NAME_KEY, PROFILE_REGISTRY_KEY
} from "../../datasource/chromeStorage/storageKeys";
import { recordVisit } from "../../repository/VisitsRepository";
import { settingsOf } from "../../entity/ProfileSettings";
import { isBookmarkableUrl } from "../../../utils/bookmarkRequest";
import { resolveDeviceName } from "../../sync/DeviceName";
import { Logger } from "../../../utils/logger";

/**
 *  Records the pages the user visits, while the active profile has `recordBrowsingHistory` on.
 *
 *  **A page is recorded once it has finished loading**, not when its address first changes:
 *  a redirect shows its intermediate address on the way, and a page that has only just started
 *  has no title yet. After that, any later report from the same tab - its title arriving, its
 *  favicon, an in-page navigation that changes the address - records it again, which for the
 *  same page on the same day only refreshes the one entry (`recordVisit`).
 *
 *  Nothing is read from Chrome's own history: there is no `history` permission, and nothing
 *  from before recording was turned on is ever collected. Incognito tabs are not seen unless
 *  the user allows the extension there.
 *
 *  The setting, the active profile and the device's name are read from storage on every
 *  event - this worker holds nothing between them, and MV3 stops it after thirty seconds.
 */

const LOG = new Logger("HistoryRecorder");

const storage = new ChromeStorageWrapper();

/** Registers the listener. Call once, from the service worker's top level. */
export function registerHistoryRecorder(): void {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
        if (!isVisitWorthRecording(changeInfo, tab)) {
            return;
        }
        void recordFrom(tab).catch(error => LOG.error("recordFrom", error));
    });
}

/**
 *  Whether an update says a page was visited: a finished page whose address, title or favicon
 *  this update reports, or the update that finishes it.
 */
export function isVisitWorthRecording(
    changeInfo: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab
): boolean {
    if (tab.status !== "complete" || !isBookmarkableUrl(tab.url)) {
        return false;
    }
    return changeInfo.status === "complete"
        || changeInfo.url !== undefined
        || changeInfo.title !== undefined
        || changeInfo.favIconUrl !== undefined;
}

async function recordFrom(tab: chrome.tabs.Tab): Promise<void> {
    const registry = await storage.get<ProfileRegistry>(PROFILE_REGISTRY_KEY);
    const profileId = registry?.activeProfileId;
    if (!profileId || !settingsOf(registry.profiles[profileId]).recordBrowsingHistory) {
        return;
    }
    await recordVisit(profileId, {
        url: tab.url!,
        title: tab.title ?? "",
        faviconUrl: tab.favIconUrl || undefined,
        visitedAt: Date.now(),
        // Always a name, as for a closed tab: a row stamped with nothing cannot be told apart
        // from one visited here.
        deviceName: resolveDeviceName(await storage.get<string>(INSTALLATION_NAME_KEY))
    });
}
