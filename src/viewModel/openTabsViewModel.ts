import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { normalizeUrl } from "../backend/worker/module/linkTabGroupCatcher";
import { isBookmarkableUrl } from "../utils/bookmarkRequest";
import { t } from "../i18n/i18n";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** One open tab, as the panel draws it. */
export interface OpenTabDTO {

    /** The browser's own tab id; what `activate` and `close` are called with. */
    id: number;
    title: string;
    url: string;
    faviconUrl?: string;

    /** Whether this address is already a link in the loaded profile. */
    bookmarked: boolean;
}

/** The open tabs of one browser window, in the order its tab strip shows them. */
export interface OpenTabWindowDTO {

    windowId: number;

    /**
     *  What the window is called above its tabs, or null when there is only one window to
     *  show - a heading over the only list there is would say nothing.
     */
    label: string | null;

    tabs: OpenTabDTO[];
}

/**
 *  The part of `chrome.tabs` and `chrome.windows` this needs; the browser's own in normal use,
 *  a fake in the tests.
 */
export interface TabsSource {
    query(): Promise<chrome.tabs.Tab[]>;
    /** The window this page is in, which is listed first and called "this window". */
    currentWindowId(): Promise<number | null>;
    activate(tab: { id: number; windowId: number }): Promise<void>;
    close(id: number): Promise<void>;
    /** Calls back whenever the set of open tabs, or anything about one, may have changed. */
    onChanged(callback: () => void): () => void;
}

/** The browser's own tabs. */
export const browserTabs: TabsSource = {
    query: () => chrome.tabs.query({}),
    currentWindowId: async () => (await chrome.tabs.getCurrent())?.windowId ?? null,
    activate: async tab => {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
    },
    close: id => chrome.tabs.remove(id),
    onChanged: callback => {
        const events = [
            chrome.tabs.onCreated, chrome.tabs.onUpdated, chrome.tabs.onRemoved,
            chrome.tabs.onMoved, chrome.tabs.onAttached, chrome.tabs.onDetached
        ] as Array<chrome.events.Event<() => void>>;
        events.forEach(event => event.addListener(callback));
        return () => events.forEach(event => event.removeListener(callback));
    }
};

/**
 *  How long a burst of tab events is waited out before the list is read again. Loading one page
 *  fires half a dozen updates - address, status, title, favicon - and each would otherwise be a
 *  query and a redraw.
 */
const REFRESH_DELAY = 150;

/**
 *  View model behind the "open tabs" card of the side panel.
 *
 *  **This browser's tabs only, and nothing stored.** The list is asked of the browser when the
 *  page loads and again whenever a tab event says it may have changed; nothing is written to
 *  storage and nothing is synchronised. That is a decision rather than a shortcut - other
 *  devices' open tabs would need an endpoint, a notion of a device being online and a privacy
 *  setting, which was judged too much for what it would show.
 *
 *  Only pages that could be kept as links are listed - which leaves out this new tab page
 *  itself, `chrome://` and the extension's own pages - and they are listed the way the tab
 *  strip shows them: window by window, the window this page is in first.
 */
export class OpenTabsViewModel {

    private LOG: Logger = new Logger("OpenTabsViewModel");

    private readonly appState: AppStateRepository;
    private readonly tabs: TabsSource;

    /** The tabs as last read, kept so a change of links can redo the marks without a query. */
    private lastRead: chrome.tabs.Tab[] = [];
    private currentWindow: number | null = null;

    private refreshTimer: ReturnType<typeof setTimeout> | null = null;
    private unsubscribes: Array<() => void> = [];

    public readonly observables = {
        windows: new ObservableValue<OpenTabWindowDTO[]>([])
    };

    /**
     *  @param appState where the links are, for the "already kept" mark
     *  @param tabs     where the tabs are; the browser's in normal use
     */
    constructor(
        appState: AppStateRepository = appStateRepository,
        tabs: TabsSource = browserTabs
    ) {
        this.appState = appState;
        this.tabs = tabs;
    }

    /** Reads the open tabs and keeps them current. */
    public async initialize(): Promise<void> {
        this.currentWindow = await this.tabs.currentWindowId();
        await this.reload();
        this.unsubscribes.push(this.tabs.onChanged(() => this.scheduleReload()));
        this.unsubscribes.push(this.appState.state$.subscribe(() => this.publish()));
    }

    /** Stops following. */
    public dispose(): void {
        if (this.refreshTimer !== null) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
    }

    /** Switches to a tab, and brings its window to the front. */
    public async activate(id: number): Promise<void> {
        const tab = this.lastRead.find(candidate => candidate.id === id);
        if (!tab) {
            return;
        }
        this.LOG.debug("activate", tab.url);
        await this.tabs.activate({ id, windowId: tab.windowId });
    }

    /** Closes a tab. If closed tabs are recorded, it turns up on the other card. */
    public async close(id: number): Promise<void> {
        this.LOG.debug("close", String(id));
        await this.tabs.close(id);
    }

    /** One tab as it is drawn, for a caller that needs it again - saving it as a link. */
    public find(id: number): OpenTabDTO | undefined {
        return this.observables.windows.get()
            .flatMap(window => window.tabs)
            .find(tab => tab.id === id);
    }

    private scheduleReload(): void {
        if (this.refreshTimer !== null) {
            return;
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            void this.reload().catch(error => this.LOG.error("reload", error));
        }, REFRESH_DELAY);
    }

    private async reload(): Promise<void> {
        this.lastRead = await this.tabs.query();
        this.publish();
    }

    private publish(): void {
        this.observables.windows.set(this.describe());
    }

    private describe(): OpenTabWindowDTO[] {

        const kept = this.keptAddresses();
        const byWindow = new Map<number, chrome.tabs.Tab[]>();

        for (const tab of this.lastRead) {
            if (tab.id === undefined || !isBookmarkableUrl(tab.url)) {
                continue;
            }
            const tabs = byWindow.get(tab.windowId) ?? [];
            tabs.push(tab);
            byWindow.set(tab.windowId, tabs);
        }

        // The window this page is in first, the rest in the order the browser reports them.
        const windowIds = [...byWindow.keys()].sort((one, other) =>
            Number(other === this.currentWindow) - Number(one === this.currentWindow));

        let otherWindows = 1;
        return windowIds.map(windowId => ({
            windowId,
            label: windowIds.length < 2
                ? null
                : windowId === this.currentWindow
                    ? t("openTabs.thisWindow")
                    : t("openTabs.window", { number: ++otherWindows }),
            tabs: byWindow.get(windowId)!
                .sort((one, other) => one.index - other.index)
                .map(tab => ({
                    id: tab.id!,
                    title: tab.title || tab.url!,
                    url: tab.url!,
                    faviconUrl: tab.favIconUrl || undefined,
                    bookmarked: this.isKept(kept, tab.url!)
                }))
        }));
    }

    /** Every address the loaded profile already keeps, compared as the closed tabs card does. */
    private keptAddresses(): Set<string> {
        const addresses = new Set<string>();
        for (const link of Object.values(this.appState.state$.get().links)) {
            const normalized = normalizeUrl(link.url);
            if (normalized) {
                addresses.add(normalized);
            }
        }
        return addresses;
    }

    private isKept(kept: Set<string>, url: string): boolean {
        const normalized = normalizeUrl(url);
        return normalized !== null && kept.has(normalized);
    }
}
