import {
    DevicePreferences, DevicePreferencesRepository, devicePreferencesRepository
} from "../backend/repository/DevicePreferencesRepository";
import {
    buildSearchUrl, SEARCH_ENGINES, SearchEngine, searchEngineOf
} from "../backend/entity/SearchEngines";

import { Logger } from "../utils/logger";
import { ObservableValue } from "../utils/observableValue";

/** What the search bar draws: the engine in use, and the ones it could switch to. */
export interface SearchBarDTO {
    engine: SearchEngine;
    engines: readonly SearchEngine[];
}

/**
 *  View model behind the search bar in the workspace heading.
 *
 *  It does not extend AbstractViewModel, for the reason SettingsViewModel does not: nothing
 *  here comes from AppState. The engine is a device preference, so the bar and the Settings
 *  dialog are two views of one value in `DevicePreferencesRepository` - changing it in either
 *  redraws the other through `preferences$`, without either knowing the other exists.
 */
export class SearchBarViewModel {

    private LOG: Logger = new Logger("SearchBarViewModel");

    private readonly devicePreferences: DevicePreferencesRepository;

    public readonly observables = {
        search: new ObservableValue<SearchBarDTO>(
            { engine: searchEngineOf(null), engines: SEARCH_ENGINES })
    };

    /**
     *  @param devicePreferences where the chosen engine is kept; the singleton in normal use
     */
    constructor(devicePreferences: DevicePreferencesRepository = devicePreferencesRepository) {
        this.devicePreferences = devicePreferences;
    }

    /** Starts publishing; fires immediately with the engine currently chosen. */
    public initialize(): void {
        this.devicePreferences.preferences$.subscribe((preferences: DevicePreferences) =>
            this.observables.search.set({
                engine: searchEngineOf(preferences.searchEngine),
                engines: SEARCH_ENGINES
            }));
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
     *  Where a query goes with the engine in use, or null when there is nothing to search for.
     *
     *  @param query what the user typed
     */
    public searchUrlFor(query: string): string | null {
        return buildSearchUrl(this.devicePreferences.getSearchEngine(), query);
    }
}
