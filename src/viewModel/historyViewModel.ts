import { AppStateRepository, appStateRepository } from "../backend/repository/AppStateRepository";
import { ProfileRepository, profileRepository } from "../backend/repository/ProfileRepository";
import { sameLocalDay, VisitsRepository } from "../backend/repository/VisitsRepository";
import { MAX_VISITS, Visit } from "../backend/entity/VisitEntity";
import { normalizeUrl } from "../backend/worker/module/linkTabGroupCatcher";
import { installationIdentity } from "../backend/sync/InstallationIdentity";
import { resolveDeviceName } from "../backend/sync/DeviceName";
import { settingsOf } from "../backend/entity/ProfileSettings";
import { describeMoment, formatDate } from "../i18n/dates";
import { t } from "../i18n/i18n";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** One visited page, as the history card draws it. */
export interface VisitDTO {

    id: string;
    title: string;
    url: string;
    faviconUrl?: string;

    /** How long ago it was visited and when exactly, already worded. */
    when: string;

    /** The device it was visited on, or null when that was this one. */
    elsewhere: string | null;

    /** Whether this address is already a link in the loaded profile. */
    bookmarked: boolean;
}

/** One day of the history, newest first. */
export interface VisitDayDTO {

    /** "Today", "Yesterday", or the date. */
    label: string;

    visits: VisitDTO[];
}

/**
 *  View model behind the browsing history card of the side panel.
 *
 *  Built as `ClosedTabsViewModel` is - the visits, which the worker writes under a key of
 *  their own, joined with the profile's links for the "already kept" mark, and following the
 *  loaded profile - with one addition: the list is grouped by the local day it happened on.
 *
 *  **Trimmed here and nowhere earlier**, for the reason the closed tabs are: what this device
 *  stores has to stay equal to what the account holds. Two devices visiting the same page on
 *  the same day leave two rows; the newer is drawn.
 */
export class HistoryViewModel {

    private LOG: Logger = new Logger("HistoryViewModel");

    private readonly visits: VisitsRepository;
    private readonly appState: AppStateRepository;
    private readonly profiles: ProfileRepository;

    private unsubscribes: Array<() => void> = [];

    public readonly observables = {
        days: new ObservableValue<VisitDayDTO[]>([]),
        /** Whether the loaded profile records browsing history; off by default. */
        recording: new ObservableValue<boolean>(false)
    };

    /**
     *  @param visits   where the history is; a fresh repository in normal use
     *  @param appState where the links are, for the "already kept" mark
     *  @param profiles where the profile's settings are, for whether anything is recorded
     *  @param now      the clock, for "today"; injectable for testing
     */
    constructor(
        visits: VisitsRepository = new VisitsRepository(),
        appState: AppStateRepository = appStateRepository,
        profiles: ProfileRepository = profileRepository,
        private readonly now: () => number = Date.now
    ) {
        this.visits = visits;
        this.appState = appState;
        this.profiles = profiles;
    }

    /** Loads the history and keeps it current. */
    public async initialize(): Promise<void> {
        await this.visits.init(this.appState.getActiveProfileId());
        this.unsubscribes.push(this.visits.visits$.subscribe(() => this.refresh()));
        this.unsubscribes.push(this.appState.state$.subscribe(() => this.onStateChanged()));
        this.unsubscribes.push(this.profiles.profiles$.subscribe(() => this.refreshRecording()));
    }

    /** Stops following. */
    public dispose(): void {
        this.unsubscribes.forEach(unsubscribe => unsubscribe());
        this.unsubscribes = [];
    }

    /** Opens a visited page again, in a tab of its own. */
    public reopen(id: string): void {
        const visit = this.find(id);
        if (!visit) {
            return;
        }
        this.LOG.debug("reopen", visit.url);
        chrome.tabs.create({ url: visit.url });
    }

    /** Forgets one entry, on every device the profile reaches. */
    public forget(id: string): Promise<void> {
        return this.visits.forget(id);
    }

    /** Forgets the whole history. */
    public forgetAll(): Promise<void> {
        return this.visits.forgetAll();
    }

    /** One entry as it is stored. */
    public find(id: string): Visit | undefined {
        return this.visits.getVisits().find(visit => visit.id === id);
    }

    /** Follows a switch of profile, which swaps the state in place rather than reloading. */
    private onStateChanged(): void {
        const active = this.appState.getActiveProfileId();
        if (active !== this.visits.getProfileId()) {
            void this.visits.init(active).then(() => this.refresh());
            this.refreshRecording();
            return;
        }
        this.refresh();
    }

    private refreshRecording(): void {
        const profile = this.profiles.getProfiles()
            .find(candidate => candidate.id === this.appState.getActiveProfileId());
        this.observables.recording.set(settingsOf(profile).recordBrowsingHistory);
    }

    private refresh(): void {
        this.observables.days.set(this.describe());
    }

    private describe(): VisitDayDTO[] {

        const kept = this.keptAddresses();
        const here = resolveDeviceName(installationIdentity.getName());
        const now = this.now();

        const days: VisitDayDTO[] = [];
        let dayOf: number | null = null;

        for (const visit of this.readable(this.visits.getVisits())) {
            if (dayOf === null || !sameLocalDay(dayOf, visit.visitedAt)) {
                dayOf = visit.visitedAt;
                days.push({ label: this.dayLabel(visit.visitedAt, now), visits: [] });
            }
            days[days.length - 1].visits.push({
                id: visit.id,
                title: visit.title || visit.url,
                url: visit.url,
                faviconUrl: visit.faviconUrl,
                when: describeMoment(visit.visitedAt, now),
                elsewhere: visit.deviceName && visit.deviceName !== here ? visit.deviceName : null,
                bookmarked: this.isKept(kept, visit.url)
            });
        }
        return days;
    }

    /** "Today", "Yesterday", or the date written the way this device writes dates. */
    private dayLabel(when: number, now: number): string {
        if (sameLocalDay(when, now)) {
            return t("history.today");
        }
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (sameLocalDay(when, yesterday.getTime())) {
            return t("history.yesterday");
        }
        return formatDate(when);
    }

    /**
     *  The list as it is worth reading: the newest row per page per day, and no more than the
     *  most any plan keeps. Stored lists are already newest first.
     */
    private readable(visits: Visit[]): Visit[] {
        const seen = new Set<string>();
        const readable: Visit[] = [];
        for (const visit of visits) {
            const day = new Date(visit.visitedAt).toDateString();
            const key = `${day} ${normalizeUrl(visit.url) ?? visit.url}`;
            if (!seen.has(key)) {
                seen.add(key);
                readable.push(visit);
            }
        }
        return readable.slice(0, MAX_VISITS);
    }

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
