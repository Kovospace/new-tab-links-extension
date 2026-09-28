import { beforeEach, describe, expect, it, vi } from "vitest";

// The engines' favicons come from the service worker, which a test does not have.
vi.mock("../../../src/ui/backgroundWorkerCommands/faviconsHandler", () => ({
    FaviconsHandler: { handleIconDownloadAndCache: async () => null }
}));

import { SearchBar } from "../../../src/ui/partials/searchBar";
import { SearchBarViewModel } from "../../../src/viewModel/searchBarViewModel";
import { DevicePreferencesRepository } from "../../../src/backend/repository/DevicePreferencesRepository";

describe("SearchBar", () => {

    let preferences: DevicePreferencesRepository;
    let bar: SearchBar;
    let form: HTMLElement;

    beforeEach(async () => {
        preferences = new DevicePreferencesRepository();
        await preferences.init();
        bar = new SearchBar(new SearchBarViewModel(preferences));
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

    it("names the engine in use in the field", () => {
        expect(input().placeholder).toContain("Google");
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

        await vi.waitFor(() => expect(input().placeholder).toContain("DuckDuckGo"));
        expect(preferences.getSearchEngine()).toBe("duckduckgo");
        expect(engineList().hidden).toBe(true);
    });

    /** The bar and Settings are two views of one preference; either redraws the other. */
    it("follows an engine chosen in Settings", async () => {
        await preferences.setSearchEngine("bing");

        expect(input().placeholder).toContain("Bing");
        expect(option("Bing").getAttribute("aria-selected")).toBe("true");
    });
});
