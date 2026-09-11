import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { ClosedTabsRepository } from "../backend/repository/ClosedTabsRepository";
import { ClosedTab } from "../backend/entity/ClosedTabEntity";
import { normalizeUrl } from "../backend/worker/module/linkTabGroupCatcher";
import { installationIdentity } from "../backend/sync/InstallationIdentity";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** One closed tab, as the panel draws it. */
export interface ClosedTabDTO {

    id: string;
    title: string;
    url: string;
    faviconUrl?: string;

    /** How long ago it was closed, already worded. */
    when: string;

    /**
     *  The device it was closed on, or null when that was this one.
     *
     *  Only worth saying when it was somewhere else: every row saying "on this device" would
     *  be noise on the machine where most of them happened.
     */
    elsewhere: string | null;

    /** Whether this address is already a link in the loaded profile. */
    bookmarked: boolean;
}

/**
 *  View model behind the recently closed tabs panel.
 *
 *  It joins two things that are stored apart: the closed tabs, which the service worker
 *  writes under a key of its own, and the profile's links, which say whether a closed tab has
 *  already been kept. Both are watched, because both change under the panel - a tab closes in
 *  another window, or a link is added from this one.
 */
export class ClosedTabsViewModel {

    private LOG: Logger = new Logger("ClosedTabsViewModel");

    private readonly closedTabs: ClosedTabsRepository;
    private readonly appState: AppStateRepository;

    private unsubscribes: Array<() => void> = [];

    public readonly observables = {
        tabs: new ObservableValue<ClosedTabDTO[]>([])
    };

    /**
     *  @param closedTabs where the closed tabs are; a fresh repository in normal use
     *  @param appState   where the links are, for the "already kept" mark
     */
    constructor(
        closedTabs: ClosedTabsRepository = new ClosedTabsRepository(),
        appState: AppStateRepository = appStateRepository
    ) {
        this.closedTabs = closedTabs;
        this.appState = appState;
    }

    /** Loads the panel and keeps it current. */
    public async initialize(): Promise<void> {
        await this.closedTabs.init(this.appState.getActiveProfileId());
        this.unsubscribes.push(this.closedTabs.tabs$.subscribe(() => this.refresh()));
        this.unsubscribes.push(this.appState.state$.subscribe(() => this.onStateChanged()));
    }

    /**
     *  Answers a change of state, which is two different things at once.
     *
     *  Usually it is a link added or removed, and only the "already kept" marks need redoing.
     *  But switching profiles does not reload the page - it swaps the state in place - and
     *  each profile has a closed tabs list of its own. Without this the panel went on showing
     *  the list of the profile that was open when the page loaded, and forgetting an entry
     *  from it wrote to that profile's list rather than to the one on screen.
     */
    private onStateChanged(): void {
        const active = this.appState.getActiveProfileId();
        if (active !== this.closedTabs.getProfileId()) {
            this.LOG.debug("onStateChanged", `Following profile ${active}`);
            void this.closedTabs.init(active).then(() => this.refresh());
            return;
        }
        this.refresh();
    }

    /** Stops following. */
    public dispose(): void {
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
    }

    /** Opens a closed tab again, in a tab of its own. */
    public reopen(id: string): void {
        const tab = this.find(id);
        if (!tab) {
            return;
        }
        this.LOG.debug("reopen", tab.url);
        chrome.tabs.create({ url: tab.url });
    }

    /** Forgets one entry, on every device the profile reaches. */
    public forget(id: string): Promise<void> {
        return this.closedTabs.forget(id);
    }

    /** Forgets the whole list. */
    public forgetAll(): Promise<void> {
        return this.closedTabs.forgetAll();
    }

    /** One entry as it is stored, for a caller that needs more than the DTO. */
    public find(id: string): ClosedTab | undefined {
        return this.closedTabs.getTabs().find(tab => tab.id === id);
    }

    private refresh(): void {
        this.observables.tabs.set(this.describe());
    }

    private describe(): ClosedTabDTO[] {

        const kept = this.keptAddresses();
        const here = installationIdentity.getName();

        return this.closedTabs.getTabs().map(tab => ({
            id: tab.id,
            title: tab.title || tab.url,
            url: tab.url,
            faviconUrl: tab.faviconUrl,
            when: describeAge(Date.now() - tab.closedAt),
            elsewhere: tab.deviceName && tab.deviceName !== here ? tab.deviceName : null,
            bookmarked: this.isKept(kept, tab.url)
        }));
    }

    /**
     *  Every address the loaded profile already keeps, compared the way the tab catcher
     *  compares them - a trailing slash is not a different page.
     */
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

/**
 *  How long ago something happened, in the coarsest unit that still says something.
 *
 *  Exported for its own test: it is the one piece of arithmetic here, and the one that reads
 *  wrong in a way nobody notices - "1 hours ago", or a minute that never becomes an hour.
 *
 *  @param milliseconds how long ago; negative is treated as just now
 */
export function describeAge(milliseconds: number): string {

    const minutes = Math.floor(milliseconds / 60_000);

    if (minutes < 1) {
        return "just now";
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return hours === 1 ? "an hour ago" : `${hours} hours ago`;
    }

    const days = Math.floor(hours / 24);
    return days === 1 ? "yesterday" : `${days} days ago`;
}
