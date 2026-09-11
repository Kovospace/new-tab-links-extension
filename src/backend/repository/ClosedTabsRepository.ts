import deepEqual from "fast-deep-equal";

import { ClosedTab, MAX_CLOSED_TABS } from "../entity/ClosedTabEntity";
import { ChromeStorageWrapper } from "../datasource/chromeStorage/chromeStorageWrapper";
import { closedTabsKey } from "../datasource/chromeStorage/storageKeys";
import { normalizeUrl } from "../worker/module/linkTabGroupCatcher";
import { uid } from "./AppStateRepositoryUtils";
import { Logger } from "../../utils/logger";
import { ObservableValue } from "../../utils/observableValue";

/**
 *  The recently closed tabs of one profile.
 *
 *  Stored under a key of its own rather than inside the profile's data, because the service
 *  worker writes it: see `closedTabsKey`. That split is the whole design - the worker appends,
 *  the page reads and removes, and neither has to hold the other's state to do so.
 *
 *  The functions below are deliberately free of any instance, so the worker can use them
 *  without carrying a repository around between the thirty seconds of life MV3 gives it. The
 *  class exists for the page, which wants an observable and wants to hear about the worker's
 *  writes as they happen.
 */

const LOG = new Logger("ClosedTabsRepository");

const storage = new ChromeStorageWrapper();

/**
 *  Records a closed tab, and prunes the list back to its cap.
 *
 *  **The same address closed twice is one entry, moved to the top.** A list that repeated
 *  itself would answer "what did I just close" with the same page four times, and would spend
 *  the account's fifty rows on ten pages.
 *
 *  @param profileId which profile's list to add to
 *  @param tab       the tab, without its identifier - one is minted here
 *  @return the entry as it was stored, or null when there was nothing to store
 */
export async function recordClosedTab(
    profileId: string,
    tab: Omit<ClosedTab, "id">
): Promise<ClosedTab | null> {

    if (!profileId || !tab.url) {
        return null;
    }

    const stored = await readClosedTabs(profileId);
    const entry: ClosedTab = { ...tab, id: uid() };

    const kept = Object.values(stored)
        .filter(existing => !sameAddress(existing.url, entry.url));

    const pruned = [entry, ...kept]
        .sort((one, other) => other.closedAt - one.closedAt)
        .slice(0, MAX_CLOSED_TABS);

    await writeClosedTabs(profileId, byId(pruned));
    LOG.debug("recordClosedTab", `${entry.url} (${pruned.length} kept)`);
    return entry;
}

/** One profile's closed tabs as stored, keyed by identifier. */
export async function readClosedTabs(profileId: string): Promise<Record<string, ClosedTab>> {
    return await storage.get<Record<string, ClosedTab>>(closedTabsKey(profileId)) ?? {};
}

/** Replaces one profile's closed tabs wholesale; used by the page and by a pull. */
export async function writeClosedTabs(
    profileId: string,
    tabs: Record<string, ClosedTab>
): Promise<void> {
    await storage.save(closedTabsKey(profileId), tabs);
}

/** The entries newest first, which is the only order this list is ever read in. */
export function newestFirst(tabs: Record<string, ClosedTab>): ClosedTab[] {
    return Object.values(tabs).sort((one, other) => other.closedAt - one.closedAt);
}

/** Whether two addresses are the same page, compared the way the tab catcher compares them. */
function sameAddress(one: string, other: string): boolean {
    const left = normalizeUrl(one);
    const right = normalizeUrl(other);
    return left !== null && left === right;
}

function byId(tabs: ClosedTab[]): Record<string, ClosedTab> {
    return Object.fromEntries(tabs.map(tab => [tab.id, tab]));
}

/**
 *  The page's view of one profile's closed tabs.
 *
 *  It follows storage rather than holding the truth, because the truth is written by the
 *  service worker: a tab closed in another window has to appear here without anything asking.
 */
export class ClosedTabsRepository {

    private profileId: string = "";

    public readonly tabs$ = new ObservableValue<ClosedTab[]>([]);

    /**
     *  Loads a profile's list and starts following it.
     *
     *  @param profileId the profile whose list to show
     */
    public async init(profileId: string): Promise<void> {
        this.profileId = profileId;
        this.tabs$.set(newestFirst(await readClosedTabs(profileId)));
        this.watchForWrites();
    }

    /** The list as it stands, newest first. */
    public getTabs(): ClosedTab[] {
        return this.tabs$.get();
    }

    /**
     *  Forgets one entry.
     *
     *  A closed tab is a log line, so removing one asks nothing and confirms nothing: the
     *  user is saying "not that one", and there is nothing to lose by believing them.
     */
    public async forget(id: string): Promise<void> {
        const stored = await readClosedTabs(this.profileId);
        if (!stored[id]) {
            return;
        }
        delete stored[id];
        await writeClosedTabs(this.profileId, stored);
        this.tabs$.set(newestFirst(stored));
    }

    /** Forgets the lot. */
    public async forgetAll(): Promise<void> {
        await writeClosedTabs(this.profileId, {});
        this.tabs$.set([]);
    }

    /**
     *  Adopts a write made elsewhere - by the worker recording a closure, or by a pull.
     *
     *  chrome.storage.onChanged is absent in the tests, which fake the storage rather than
     *  the whole API, so its absence is not an error.
     */
    private watchForWrites(): void {

        if (!chrome.storage?.onChanged?.addListener) {
            return;
        }

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }
            const incoming = changes[closedTabsKey(this.profileId)]?.newValue as
                Record<string, ClosedTab> | undefined;

            if (!incoming) {
                return;
            }
            const next = newestFirst(incoming);
            if (!deepEqual(next, this.tabs$.get())) {
                this.tabs$.set(next);
            }
        });
    }
}
