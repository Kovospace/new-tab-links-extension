import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The engines' favicons come from the service worker, which a test does not have.
vi.mock("../../../src/ui/backgroundWorkerCommands/faviconsHandler", () => ({
    FaviconsHandler: { handleIconDownloadAndCache: async () => null }
}));

import { SearchBar, SUGGEST_DELAY } from "../../../src/ui/partials/searchBar";
import { SearchBarViewModel, SuggestionSources } from "../../../src/viewModel/searchBarViewModel";
import { environment, group, link, profileOf } from "../../support/profileDataFixtures";
import { DevicePreferencesRepository } from "../../../src/backend/repository/DevicePreferencesRepository";

describe("SearchBar", () => {

    let preferences: DevicePreferencesRepository;
    let bar: SearchBar;
    let form: HTMLElement;
    let visited: string[];
    let browserSearches: string[];

    const sources: SuggestionSources = {
        data: () => profileOf({
            environments: [environment("e", "Work")],
            groups: [group("g", "Reading", "e")],
            links: [
                link("a", "Weather radar", "https://radar.test/", "g", "e"),
                link("b", "Weather forecast", "https://forecast.test/", "g", "e", { position: 1 })
            ],
            activeEnvironmentId: "e"
        }),
        closedTabs: async () => [],
        visits: async () => [],
        openTabs: async () => [],
        activateTab: async () => undefined
    };

    beforeEach(async () => {
        preferences = new DevicePreferencesRepository();
        await preferences.init();
        visited = [];
        browserSearches = [];
        bar = new SearchBar(new SearchBarViewModel(preferences, {
            searchWithBrowser: async text => { browserSearches.push(text); },
            navigate: url => { visited.push(url); }
        }, sources));
        form = bar.element();
        document.body.replaceChildren(form);
    });

    const input = () => form.querySelector<HTMLInputElement>("input.search-bar__input")!;
    const engineButton = () => form.querySelector<HTMLButtonElement>("button.search-bar__engine-button")!;
    const engineList = () => form.querySelector<HTMLElement>("ul.search-bar__engines")!;
    const option = (name: string) => Array.from(form.querySelectorAll<HTMLButtonElement>("button.search-bar__engine-option"))
        .find(button => button.textContent === name)!;

    /**
     *  The heading is redrawn whenever the workspace is renamed or switched. A bar built
     *  anew each time would take whatever was half typed into it along with the old one.
     */
    it("is the same element on every call, so a redraw keeps what was typed", () => {
        input().value = "half a query";

        expect(bar.element()).toBe(form);
        expect(input().value).toBe("half a query");
    });

    it("starts on the browser's own engine, which it does not pretend to name", () => {
        expect(option("Default search engine").getAttribute("aria-selected")).toBe("true");
    });

    it("says it searches the profile as well as the web", () => {
        expect(input().placeholder).toBe("Search my bookmarks, closed tabs, history or the web");
    });

    it("offers the browser's own engine first in the list", () => {
        const first = form.querySelector<HTMLButtonElement>("button.search-bar__engine-option");
        expect(first?.textContent).toBe("Default search engine");
    });

    it("opens the engine list from the icon, and closes it on a click elsewhere", () => {
        engineButton().click();
        expect(engineList().hidden).toBe(false);

        document.body.click();
        expect(engineList().hidden).toBe(true);
    });

    it("remembers an engine chosen from the list", async () => {
        engineButton().click();
        option("DuckDuckGo").click();

        await vi.waitFor(() => expect(option("DuckDuckGo").getAttribute("aria-selected")).toBe("true"));
        expect(preferences.getSearchEngine()).toBe("duckduckgo");
        expect(engineList().hidden).toBe(true);
    });

    /** The bar and Settings are two views of one preference; either redraws the other. */
    it("follows an engine chosen in Settings", async () => {
        await preferences.setSearchEngine("bing");

        expect(option("Bing").getAttribute("aria-selected")).toBe("true");
    });

    describe("suggestions", () => {

        const rows = () => Array.from(form.querySelectorAll<HTMLElement>("li.search-bar__suggestion"));
        const list = () => form.querySelector<HTMLElement>("ul.search-bar__suggestions")!;
        const titlesShown = () => rows().map(row =>
            row.querySelector(".search-bar__suggestion-title")!.textContent);
        const highlightedTitle = () =>
            form.querySelector("li.search-bar__suggestion.active .search-bar__suggestion-title")?.textContent;

        /** Types into the field and lets the pause pass, as a person stopping typing would. */
        async function type(text: string): Promise<void> {
            input().value = text;
            input().dispatchEvent(new Event("input"));
            await vi.advanceTimersByTimeAsync(SUGGEST_DELAY);
        }

        const press = (key: string) =>
            input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        const submit = async () => {
            form.dispatchEvent(new Event("submit", { cancelable: true }));
            await vi.waitFor(() => expect(visited.length + browserSearches.length).toBe(1));
        };

        beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }); });
        afterEach(() => { vi.useRealTimers(); });

        it("waits for typing to pause, then lists the links and searching the web", async () => {
            input().value = "weather";
            input().dispatchEvent(new Event("input"));
            await vi.advanceTimersByTimeAsync(SUGGEST_DELAY - 1);
            expect(list().hidden).toBe(true);

            await vi.advanceTimersByTimeAsync(1);
            expect(list().hidden).toBe(false);
            expect(titlesShown()).toEqual(["Weather radar", "Weather forecast", "weather"]);
            expect(highlightedTitle()).toBe("Weather radar");
        });

        it("opens the highlighted suggestion on Enter, the first one unless moved", async () => {
            await type("weather");

            await submit();

            expect(visited).toEqual(["https://radar.test/"]);
            expect(list().hidden).toBe(true);
        });

        it("moves the highlight with the arrow keys, round the ends", async () => {
            await type("weather");

            press("ArrowDown");
            expect(highlightedTitle()).toBe("Weather forecast");
            press("ArrowUp");
            press("ArrowUp");
            expect(highlightedTitle()).toBe("weather");

            await submit();
            expect(browserSearches).toEqual(["weather"]);
        });

        it("searches the profile at once when Enter beats the pause", async () => {
            input().value = "forecast";
            input().dispatchEvent(new Event("input"));

            await submit();

            expect(visited).toEqual(["https://forecast.test/"]);
        });

        it("closes on Escape and when the field is emptied", async () => {
            await type("weather");
            press("Escape");
            expect(list().hidden).toBe(true);

            await type("weather");
            await type("");
            expect(list().hidden).toBe(true);
        });
    });
});
