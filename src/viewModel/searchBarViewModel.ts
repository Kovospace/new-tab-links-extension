import {
    DevicePreferences, DevicePreferencesRepository, devicePreferencesRepository
} from "../backend/repository/DevicePreferencesRepository";
import {
    buildSearchUrl, SEARCH_ENGINES, SearchEngine, SearchEngineId, searchEngineOf
} from "../backend/entity/SearchEngines";
import { t } from "../i18n/i18n";

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

    public readonly observables = {
        search: new ObservableValue<SearchBarDTO>(describe(searchEngineOf(null)))
    };

    /**
     *  @param devicePreferences where the chosen engine is kept; the singleton in normal use
     *  @param destinations      how a query leaves the page; the browser in normal use
     */
    constructor(
        devicePreferences: DevicePreferencesRepository = devicePreferencesRepository,
        destinations: SearchDestinations = BROWSER_DESTINATIONS
    ) {
        this.devicePreferences = devicePreferences;
        this.destinations = destinations;
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
}

/** An engine in the words the interface uses for it. */
export function engineDTO(engine: SearchEngine): SearchEngineDTO {
    return engine.kind === "browser"
        ? { id: engine.id, label: t("search.browserDefault"), homeUrl: null }
        : { id: engine.id, label: engine.name, homeUrl: engine.homeUrl };
}

function describe(engine: SearchEngine): SearchBarDTO {
    return { engine: engineDTO(engine), engines: SEARCH_ENGINES.map(engineDTO) };
}
