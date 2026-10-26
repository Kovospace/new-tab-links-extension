import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { BROWSER_PAGE_OPENER, OpenWhere, PageOpener, openPage } from "../utils/pageOpener";
import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { ClosedTabsRepository } from "../backend/repository/ClosedTabsRepository";
import { ClosedTab, MAX_CLOSED_TABS } from "../backend/entity/ClosedTabEntity";
import { normalizeUrl } from "../backend/worker/module/linkTabGroupCatcher";
import { installationIdentity } from "../backend/sync/InstallationIdentity";
import { resolveDeviceName } from "../backend/sync/DeviceName";
import { settingsOf } from "../backend/entity/ProfileSettings";
import { describeMoment } from "../i18n/dates";

import { Logger } from "../utils/logger";
import { matchesQuery } from "../utils/textSearch";
import { ObservableValue } from "../utils/observableValue";

/** One closed tab, as the panel draws it. */
export interface ClosedTabDTO {

    id: string;
    title: string;
    url: string;
    faviconUrl?: string;

    /** How long ago it was closed and when exactly, already worded. */
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
    private readonly profiles: ProfileRepository;

    private unsubscribes: Array<() => void> = [];

    /** What the panel's search field holds; blank shows everything. */
    private query: string = "";

    public readonly observables = {
        tabs: new ObservableValue<ClosedTabDTO[]>([]),
        /**
         *  Whether the loaded profile records closed tabs. When it does not, the panel stays
         *  where it is and says so, rather than disappearing and leaving nothing to say where
         *  it went.
         */
        recording: new ObservableValue<boolean>(true)
    };

    /**
     *  @param closedTabs where the closed tabs are; a fresh repository in normal use
     *  @param appState   where the links are, for the "already kept" mark
     *  @param profiles   where the profile's settings are, for whether anything is recorded
     */
    constructor(
        closedTabs: ClosedTabsRepository = new ClosedTabsRepository(),
        appState: AppStateRepository = appStateRepository,
        profiles: ProfileRepository = profileRepository,
        private readonly opener: PageOpener = BROWSER_PAGE_OPENER
    ) {
        this.closedTabs = closedTabs;
        this.appState = appState;
        this.profiles = profiles;
    }

    /** Loads the panel and keeps it current. */
    public async initialize(): Promise<void> {
        await this.closedTabs.init(this.appState.getActiveProfileId());
        this.unsubscribes.push(this.closedTabs.tabs$.subscribe(() => this.refresh()));
        this.unsubscribes.push(this.appState.state$.subscribe(() => this.onStateChanged()));
        this.unsubscribes.push(this.profiles.profiles$.subscribe(() => this.refreshRecording()));
    }

    /** Reads whether the loaded profile records closed tabs, which a pull can change too. */
    private refreshRecording(): void {
        const profile = this.profiles.getProfiles()
            .find(candidate => candidate.id === this.appState.getActiveProfileId());
        this.observables.recording.set(settingsOf(profile).recordClosedTabs);
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
            this.refreshRecording();
            return;
        }
        this.refresh();
    }

    /** Stops following. */
    public dispose(): void {
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
    }

    /**
     *  Opens a closed tab again - in this tab, as a link on the page opens, or in a new one.
     *
     *  @param where "here" for a click on the row, "newTab" for its own button
     */
    public reopen(id: string, where: OpenWhere = "here"): void {
        const tab = this.find(id);
        if (!tab) {
            return;
        }
        this.LOG.debug("reopen", where, tab.url);
        openPage(this.opener, tab.url, where);
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

    /** Narrows the list to the entries matching every word typed; blank shows them all. */
    public setQuery(query: string): void {
        this.query = query;
        this.refresh();
    }

    private refresh(): void {
        this.observables.tabs.set(this.describe());
    }

    private describe(): ClosedTabDTO[] {

        const kept = this.keptAddresses();
        // The same label the worker stamps on a closure here, so that "was this closed
        // somewhere else" is one string comparison and not a guess.
        const here = resolveDeviceName(installationIdentity.getName());

        return this.readable(this.closedTabs.getTabs())
            .filter(tab => matchesQuery(this.query, tab.title, tab.url))
            .map(tab => ({
            id: tab.id,
            title: tab.title || tab.url,
            url: tab.url,
            faviconUrl: tab.faviconUrl,
            when: describeMoment(tab.closedAt),
            elsewhere: tab.deviceName && tab.deviceName !== here ? tab.deviceName : null,
            bookmarked: this.isKept(kept, tab.url)
        }));
    }

    /**
     *  The list as it is worth reading, which is not the same as the list as it is stored.
     *
     *  **Trimmed here and nowhere earlier.** What this device stores has to stay equal to what
     *  the account holds: anything dropped on the way in is a difference the next change set
     *  reports, and reports again on every synchronisation, while every report draws a change
     *  notification that sets the other connected device doing the same. So the account keeps
     *  what it keeps, and the panel shows what is worth showing.
     *
     *  Two devices closing the same page leave two rows - the backend cannot refuse them,
     *  a unique constraint there would make a legitimate push fail - and the newer is the one
     *  worth having. The cap is the same one recording applies, so a list that arrived over-full
     *  from an account two devices have been filling still reads as a list.
     */
    private readable(tabs: ClosedTab[]): ClosedTab[] {

        const byAddress = new Map<string, ClosedTab>();
        for (const tab of tabs) {
            const address = normalizeUrl(tab.url) ?? tab.url;
            if (!byAddress.has(address)) {
                byAddress.set(address, tab);
            }
        }

        return [...byAddress.values()].slice(0, MAX_CLOSED_TABS);
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
