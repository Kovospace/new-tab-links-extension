import { beforeEach, describe, expect, it } from "vitest";

import { SearchBarViewModel } from "../../src/viewModel/searchBarViewModel";
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
