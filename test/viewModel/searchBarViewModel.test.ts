import { beforeEach, describe, expect, it } from "vitest";

import { SearchBarViewModel, SuggestionSources } from "../../src/viewModel/searchBarViewModel";
import { environment, group, link, profileOf } from "../support/profileDataFixtures";
import { DevicePreferencesRepository } from "../../src/backend/repository/DevicePreferencesRepository";

describe("SearchBarViewModel.search", () => {

    let preferences: DevicePreferencesRepository;
    let viewModel: SearchBarViewModel;
    let browserSearches: string[];
    let visited: string[];

    beforeEach(async () => {
        preferences = new DevicePreferencesRepository();
        await preferences.init();
        browserSearches = [];
        visited = [];
        viewModel = new SearchBarViewModel(preferences, {
            searchWithBrowser: async text => { browserSearches.push(text); },
            navigate: url => { visited.push(url); }
        });
        viewModel.initialize();
    });

    /** The store's rule: until the user chooses, the browser's own engine answers. */
    it("searches with the browser's own engine until another is chosen", async () => {
        expect(await viewModel.search("  weather  ")).toBe(true);

        expect(browserSearches).toEqual(["weather"]);
        expect(visited).toEqual([]);
    });

    it("opens the chosen engine's plain search address once one is chosen", async () => {
        await viewModel.chooseEngine("duckduckgo");

        await viewModel.search("tab groups");

        expect(visited).toEqual(["https://duckduckgo.com/?q=tab%20groups"]);
        expect(browserSearches).toEqual([]);
    });

    it("goes back to the browser's engine when that is chosen again", async () => {
        await viewModel.chooseEngine("bing");
        await viewModel.chooseEngine("browser");

        await viewModel.search("weather");

        expect(browserSearches).toEqual(["weather"]);
    });

    it("searches for nothing when nothing was typed", async () => {
        expect(await viewModel.search("   ")).toBe(false);

        expect(browserSearches).toEqual([]);
        expect(visited).toEqual([]);
    });

    it("calls the browser's engine by what it is, not by a name Chrome does not give", () => {
        const { engine, engines } = viewModel.observables.search.get();

        expect(engine.label).toBe("Default search engine");
        expect(engine.homeUrl).toBeNull();
        expect(engines[0].id).toBe("browser");
    });
});

/**
 *  The profile is searched before the web (#85): the view model publishes what to offer, with
 *  "search the web" always last, and goes where the chosen suggestion leads.
 */
describe("SearchBarViewModel.suggest", () => {

    let preferences: DevicePreferencesRepository;
    let viewModel: SearchBarViewModel;
    let browserSearches: string[];
    let visited: string[];
    let activated: number[];

    beforeEach(async () => {
        preferences = new DevicePreferencesRepository();
        await preferences.init();
        browserSearches = [];
        visited = [];
        activated = [];
        const sources: SuggestionSources = {
            data: () => profileOf({
                environments: [environment("e", "Work")],
                groups: [group("g", "Reading", "e")],
                links: [link("l", "Weather radar", "https://radar.test/", "g", "e")],
                activeEnvironmentId: "e"
            }),
            closedTabs: async () => [],
            visits: async () => [],
            openTabs: async () => [
                { id: 9, windowId: 2, url: "https://weather.test/", title: "Weather now" } as chrome.tabs.Tab
            ],
            activateTab: async tab => { activated.push(tab.id); }
        };
        viewModel = new SearchBarViewModel(preferences, {
            searchWithBrowser: async text => { browserSearches.push(text); },
            navigate: url => { visited.push(url); }
        }, sources);
        viewModel.initialize();
    });

    const offered = () => viewModel.observables.suggestions.get();

    it("offers the profile's matches first and searching the web last", async () => {
        await viewModel.suggest("weather");

        expect(offered().map(one => [one.kind, one.title])).toEqual([
            ["link", "Weather radar"], ["openTab", "Weather now"], ["web", "weather"]
        ]);
        expect(offered()[2].where).toBe("Search the web");
    });

    it("names the engine on the web suggestion once one is chosen", async () => {
        await viewModel.chooseEngine("duckduckgo");
        await viewModel.suggest("anything");

        expect(offered()).toEqual([
            { kind: "web", title: "anything", url: null, where: "Search DuckDuckGo" }
        ]);
    });

    it("keeps only the answer to the newest query", async () => {
        const older = viewModel.suggest("weather");
        const newer = viewModel.suggest("radar");
        await Promise.all([older, newer]);

        expect(offered().map(one => one.title)).toEqual(["Weather radar", "radar"]);
    });

    it("opens a link here, switches to an open tab, and searches the web", async () => {
        await viewModel.suggest("weather");
        const [linkSuggestion, tabSuggestion, web] = offered();

        await viewModel.open(linkSuggestion, "weather");
        await viewModel.open(tabSuggestion, "weather");
        await viewModel.open(web, "weather");

        expect(visited).toEqual(["https://radar.test/"]);
        expect(activated).toEqual([9]);
        expect(browserSearches).toEqual(["weather"]);
    });
});
