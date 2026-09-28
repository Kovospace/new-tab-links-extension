import { describe, expect, it } from "vitest";

import {
    buildSearchUrl, DEFAULT_SEARCH_ENGINE, normalizeSearchEngine, SEARCH_ENGINES, searchEngineOf
} from "../../../src/backend/entity/SearchEngines";

describe("SEARCH_ENGINES", () => {

    it("offers at least Google, DuckDuckGo and Bing", () => {
        expect(SEARCH_ENGINES.map(engine => engine.id))
            .toEqual(expect.arrayContaining(["google", "duckduckgo", "bing"]));
    });

    it("sends every query over https", () => {
        for (const engine of SEARCH_ENGINES) {
            expect(engine.queryUrlPrefix.startsWith("https://")).toBe(true);
        }
    });
});

describe("buildSearchUrl", () => {

    it("appends the query to the engine's address", () => {
        expect(buildSearchUrl("duckduckgo", "tab groups"))
            .toBe("https://duckduckgo.com/?q=tab%20groups");
    });

    /**
     *  The query is text, not part of the address. Unencoded, "&" would start a second
     *  parameter and "#" would cut the query off where it stands.
     */
    it("encodes what would otherwise be read as part of the address", () => {
        expect(buildSearchUrl("google", "c# & rust?"))
            .toBe("https://www.google.com/search?q=c%23%20%26%20rust%3F");
    });

    it("leaves out the whitespace around a query", () => {
        expect(buildSearchUrl("bing", "  weather  ")).toBe("https://www.bing.com/search?q=weather");
    });

    it("has nothing to send for a blank query", () => {
        expect(buildSearchUrl("google", "")).toBeNull();
        expect(buildSearchUrl("google", "   ")).toBeNull();
    });

    it("searches with the default engine when the one named is not on offer", () => {
        expect(buildSearchUrl("altavista", "x"))
            .toBe(searchEngineOf(DEFAULT_SEARCH_ENGINE).queryUrlPrefix + "x");
    });
});

describe("normalizeSearchEngine", () => {

    it("keeps an engine that is on offer", () => {
        expect(normalizeSearchEngine("bing")).toBe("bing");
    });

    it("reads anything else as the default", () => {
        expect(normalizeSearchEngine(undefined)).toBe(DEFAULT_SEARCH_ENGINE);
        expect(normalizeSearchEngine("altavista")).toBe(DEFAULT_SEARCH_ENGINE);
    });
});
