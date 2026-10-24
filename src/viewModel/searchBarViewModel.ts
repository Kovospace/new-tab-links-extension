import {
    DevicePreferences, DevicePreferencesRepository, devicePreferencesRepository
} from "../backend/repository/DevicePreferencesRepository";
import {
    buildSearchUrl, SEARCH_ENGINES, SearchEngine, SearchEngineId, searchEngineOf
} from "../backend/entity/SearchEngines";
import { t } from "../i18n/i18n";
import { ProfileData } from "../backend/entity/AppStateEntity";
import { ClosedTab } from "../backend/entity/ClosedTabEntity";
import { Visit } from "../backend/entity/VisitEntity";
import { appStateRepository } from "../backend/repository/AppStateRepository";
import { readClosedTabs } from "../backend/repository/ClosedTabsRepository";
import { readVisits } from "../backend/repository/VisitsRepository";
import { browserTabs } from "./openTabsViewModel";
import { gatherSuggestions, SuggestionDTO } from "./searchSuggestions";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** One engine as the bar draws it. */
export interface SearchEngineDTO {
    id: SearchEngineId;
    /** What it is called - "Default search engine" for the browser's own, else its brand. */
    label: string;
    /** Whose favicon to draw, or null for the browser's own engine, which has none to show. */
    homeUrl: string | null;
}

/** What the search bar draws: the engine in use, and the ones it could switch to. */
export interface SearchBarDTO {
    engine: SearchEngineDTO;
    engines: SearchEngineDTO[];
}

/** How a query leaves the page; the real browser in normal use, a recorder in a test. */
export interface SearchDestinations {
    /** Searches with the browser's own engine, in this tab. */
    searchWithBrowser(text: string): Promise<void>;
    /** Opens an address in this tab. */
    navigate(url: string): void;
}

const BROWSER_DESTINATIONS: SearchDestinations = {
    searchWithBrowser: text => chrome.search.query({ text, disposition: "CURRENT_TAB" }),
    navigate: url => { window.location.href = url; }
};

/**
 *  Where suggestions are looked for: the loaded profile and its logs, and this browser's tabs.
 *  The real ones in normal use, fakes in the tests.
 */
export interface SuggestionSources {
    data(): ProfileData;
    closedTabs(): Promise<ClosedTab[]>;
    visits(): Promise<Visit[]>;
    openTabs(): Promise<chrome.tabs.Tab[]>;
    activateTab(tab: { id: number; windowId: number }): Promise<void>;
}

const PROFILE_SOURCES: SuggestionSources = {
    data: () => appStateRepository.state$.get(),
    closedTabs: async () => Object.values(await readClosedTabs(appStateRepository.getActiveProfileId())),
    visits: async () => Object.values(await readVisits(appStateRepository.getActiveProfileId())),
    openTabs: () => browserTabs.query(),
    activateTab: tab => browserTabs.activate(tab)
};

/**
 *  View model behind the search bar in the workspace heading.
 *
 *  It does not extend AbstractViewModel, for the reason SettingsViewModel does not: nothing
 *  here comes from AppState. The engine is a device preference, so the bar and the Settings
 *  dialog are two views of one value in `DevicePreferencesRepository` - changing it in either
 *  redraws the other through `preferences$`, without either knowing the other exists.
 *
 *  **Until the user chooses, the browser's own engine searches.** That is the Chrome Web Store's
 *  rule for a new tab page with web search, and it is the default the preference starts at.
 *  A choice made in the dropdown or in Settings is remembered on this device, and the browser's
 *  engine stays first in both lists, as the way back.
 *
 *  **What is typed never goes anywhere but the engine.** Nothing is logged, stored, synchronised
 *  or sent to our own backend.
 */
export class SearchBarViewModel {

    private LOG: Logger = new Logger("SearchBarViewModel");

    private readonly devicePreferences: DevicePreferencesRepository;
    private readonly destinations: SearchDestinations;

    private readonly sources: SuggestionSources;

    /** Counts queries, so that an answer arriving after a newer query's is dropped. */
    private suggestionRun = 0;

    public readonly observables = {
        search: new ObservableValue<SearchBarDTO>(describe(searchEngineOf(null))),
        /**
         *  What to offer under the field for what was last typed: the profile's own matches,
         *  then "search the web", which is always there. Empty while nothing is typed.
         */
        suggestions: new ObservableValue<SuggestionDTO[]>([])
    };

    /**
     *  @param devicePreferences where the chosen engine is kept; the singleton in normal use
     *  @param destinations      how a query leaves the page; the browser in normal use
     */
    constructor(
        devicePreferences: DevicePreferencesRepository = devicePreferencesRepository,
        destinations: SearchDestinations = BROWSER_DESTINATIONS,
        sources: SuggestionSources = PROFILE_SOURCES
    ) {
        this.devicePreferences = devicePreferences;
        this.destinations = destinations;
        this.sources = sources;
    }

    /** Starts publishing; fires immediately with the engine currently chosen. */
    public initialize(): void {
        this.devicePreferences.preferences$.subscribe((preferences: DevicePreferences) =>
            this.observables.search.set(describe(searchEngineOf(preferences.searchEngine))));
    }

    /**
     *  Switches the engine, and remembers it on this device.
     *
     *  @param engineId one of the engines on offer
     */
    public async chooseEngine(engineId: string): Promise<void> {
        this.LOG.debug("chooseEngine", engineId);
        await this.devicePreferences.setSearchEngine(engineId);
    }

    /**
     *  Searches for what was typed with the engine in use, in this tab.
     *
     *  @param query what the user typed
     *  @return whether anything was searched for; false for a blank query
     */
    public async search(query: string): Promise<boolean> {
        const text = query.trim();
        if (!text) {
            return false;
        }
        const engine = searchEngineOf(this.devicePreferences.getSearchEngine());
        if (engine.kind === "browser") {
            await this.destinations.searchWithBrowser(text);
            return true;
        }
        const url = buildSearchUrl(engine.id, text);
        if (!url) {
            return false;
        }
        this.destinations.navigate(url);
        return true;
    }

    /**
     *  Looks for what was typed among the profile's links, this browser's open tabs, the
     *  closed tabs and the history, and publishes what to offer - "search the web" last.
     *
     *  Only the loaded profile is searched, across all its workspaces: another profile's links
     *  are another person's, or another part of one person's life, and they are not mixed in.
     *
     *  @param query what is in the field now
     */
    public async suggest(query: string): Promise<void> {
        const run = ++this.suggestionRun;
        const text = query.trim();
        if (!text) {
            this.observables.suggestions.set([]);
            return;
        }
        const [openTabs, closedTabs, visits] = await Promise.all([
            this.sources.openTabs().catch(() => []),
            this.sources.closedTabs(),
            this.sources.visits()
        ]);
        if (run !== this.suggestionRun) {
            return;     // something newer was typed meanwhile
        }
        const found = gatherSuggestions(text, { data: this.sources.data(), openTabs, closedTabs, visits });
        this.observables.suggestions.set([...found, this.webSuggestion(text)]);
    }

    /** Takes the suggestions away, as the field is emptied or left. */
    public clearSuggestions(): void {
        this.suggestionRun++;
        this.observables.suggestions.set([]);
    }

    /**
     *  Goes where a suggestion leads. A page replaces this one, as a link clicked on it does;
     *  an open tab is switched to rather than opened twice; the web is searched as before.
     *
     *  @param suggestion what was chosen
     *  @param query      what was typed, for "search the web"
     */
    public async open(suggestion: SuggestionDTO, query: string): Promise<void> {
        this.LOG.debug("open", `${suggestion.kind} ${suggestion.url ?? query}`);
        if (suggestion.kind === "web" || suggestion.url === null) {
            await this.search(query);
        } else if (suggestion.tab) {
            await this.sources.activateTab(suggestion.tab);
        } else {
            this.destinations.navigate(suggestion.url);
        }
    }

    /** "Search the web", named after the engine in use. */
    private webSuggestion(query: string): SuggestionDTO {
        const engine = searchEngineOf(this.devicePreferences.getSearchEngine());
        return {
            kind: "web",
            title: query,
            url: null,
            where: engine.kind === "browser"
                ? t("search.suggestion.web")
                : t("search.suggestion.webWith", { engine: engine.name })
        };
    }
}

export function engineDTO(engine: SearchEngine): SearchEngineDTO {
    return engine.kind === "browser"
        ? { id: engine.id, label: t("search.browserDefault"), homeUrl: null }
        : { id: engine.id, label: engine.name, homeUrl: engine.homeUrl };
}

function describe(engine: SearchEngine): SearchBarDTO {
    return { engine: engineDTO(engine), engines: SEARCH_ENGINES.map(engineDTO) };
}
