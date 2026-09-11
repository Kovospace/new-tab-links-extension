import type { ProfileRegistry } from "../../repository/ProfileRepository";
import { ChromeStorageWrapper } from "../../datasource/chromeStorage/chromeStorageWrapper";
import {
    INSTALLATION_NAME_KEY, PROFILE_REGISTRY_KEY
} from "../../datasource/chromeStorage/storageKeys";
import { recordClosedTab } from "../../repository/ClosedTabsRepository";
import { isBookmarkableUrl } from "../../../utils/bookmarkRequest";
import { Logger } from "../../../utils/logger";

/**
 *  Remembers the tabs the user closes.
 *
 *  **`chrome.tabs.onRemoved` does not say what was closed.** It carries a tab identifier and
 *  nothing else - by the time it fires the tab is gone from the API, so its address and title
 *  cannot be asked for. The only way to know is to have written them down beforehand, which
 *  is what the mirror below is: every navigation updates one entry per open tab, and the
 *  removal reads it back.
 *
 *  The mirror lives in `chrome.storage.session`, not in memory. MV3 stops this worker after
 *  thirty seconds of quiet and it forgets everything it held, which would mean forgetting
 *  every tab opened more than half a minute before it was closed - that is to say, all of the
 *  interesting ones. Session storage lasts as long as the browser is open and no longer,
 *  which is exactly the life a mirror of the open tabs should have.
 *
 *  Nothing is recorded for a page that cannot be kept as a link: `chrome://`, the extension's
 *  own pages, a blank tab. The panel exists to find pages again, and none of those are pages.
 */

const LOG = new Logger("ClosedTabsRecorder");

const storage = new ChromeStorageWrapper();

/** Where the mirror of the open tabs is kept, for the length of the browser session. */
const MIRROR_KEY = "open_tabs_mirror";

/** What is remembered about one open tab; the least that makes it findable again. */
interface MirroredTab {
    url: string;
    title: string;
    faviconUrl?: string;
}

type TabMirror = Record<string, MirroredTab>;

/**
 *  Registers the listeners. Call once, from the service worker's top level.
 *
 *  Both are needed and neither is optional: without the update there is nothing to read on
 *  removal, and without the removal nothing is ever recorded.
 */
export function registerClosedTabsRecorder(): void {

    chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
        // Every update, not only navigations: the title and the favicon arrive after the
        // address does, and a tab closed in between should not be remembered as untitled.
        void rememberTab(tabId, tab).catch(error => LOG.error("rememberTab", error));
    });

    chrome.tabs.onRemoved.addListener(tabId => {
        void recordRemoval(tabId).catch(error => LOG.error("recordRemoval", error));
    });
}

/** Writes down what a tab currently is, so that its closing can be understood. */
async function rememberTab(tabId: number, tab: chrome.tabs.Tab): Promise<void> {

    if (!isBookmarkableUrl(tab.url)) {
        // Not a page worth keeping, and it may have been one a moment ago - a tab navigating
        // from a site to the new tab page must not be remembered as the site.
        await forget(tabId);
        return;
    }

    const mirror = await readMirror();
    mirror[String(tabId)] = {
        url: tab.url,
        title: tab.title ?? "",
        faviconUrl: tab.favIconUrl
    };
    await writeMirror(mirror);
}

/** Records the closure of a tab the mirror knows about, and forgets it. */
async function recordRemoval(tabId: number): Promise<void> {

    const mirror = await readMirror();
    const closed = mirror[String(tabId)];

    if (!closed) {
        // A tab the mirror never saw: opened before this extension was installed or updated,
        // or one that never reached a page worth keeping.
        return;
    }

    delete mirror[String(tabId)];
    await writeMirror(mirror);

    const profileId = await activeProfileId();
    if (!profileId) {
        return;
    }

    await recordClosedTab(profileId, {
        url: closed.url,
        title: closed.title,
        faviconUrl: closed.faviconUrl,
        closedAt: Date.now(),
        // The device's name as the user gave it, if they gave one. Read from storage on every
        // closure rather than held: this worker keeps nothing between events.
        deviceName: await deviceName() ?? undefined
    });
}

async function forget(tabId: number): Promise<void> {
    const mirror = await readMirror();
    if (mirror[String(tabId)]) {
        delete mirror[String(tabId)];
        await writeMirror(mirror);
    }
}

async function readMirror(): Promise<TabMirror> {
    const stored = await chrome.storage.session.get(MIRROR_KEY);
    return (stored[MIRROR_KEY] as TabMirror | undefined) ?? {};
}

async function writeMirror(mirror: TabMirror): Promise<void> {
    await chrome.storage.session.set({ [MIRROR_KEY]: mirror });
}

/** The profile the closure belongs to: the one loaded, read fresh as everything here is. */
async function activeProfileId(): Promise<string | null> {
    const registry = await storage.get<ProfileRegistry>(PROFILE_REGISTRY_KEY);
    return registry?.activeProfileId ?? null;
}

/** The name of this installation, or null when the user never gave it one. */
async function deviceName(): Promise<string | null> {
    return storage.get<string>(INSTALLATION_NAME_KEY);
}
