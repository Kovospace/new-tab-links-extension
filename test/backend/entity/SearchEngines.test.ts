import { describe, expect, it } from "vitest";

import {
    buildSearchUrl, DEFAULT_SEARCH_ENGINE, normalizeSearchEngine, SEARCH_ENGINES, searchEngineOf
} from "../../../src/backend/entity/SearchEngines";

describe("SEARCH_ENGINES", () => {

    /**
     *  The Chrome Web Store's rule for a new tab page with web search: it must default to the
     *  engine the user set in the browser, reached through the Chrome Search API, and a list of
     *  providers must have that one first.
     */
    it("puts the browser's own engine first, and makes it the default", () => {
        expect(SEARCH_ENGINES[0].kind).toBe("browser");
        expect(DEFAULT_SEARCH_ENGINE).toBe("browser");
    });

    it("offers Google, DuckDuckGo and Bing besides", () => {
        expect(SEARCH_ENGINES.map(engine => engine.id))
            .toEqual(expect.arrayContaining(["google", "duckduckgo", "bing"]));
    });

    it("sends every other engine's query over https, with no partner parameters", () => {
        for (const engine of SEARCH_ENGINES) {
            if (engine.kind !== "web") continue;
            expect(engine.queryUrlPrefix.startsWith("https://")).toBe(true);
            // One parameter, the query, and nothing after it.
            expect(engine.queryUrlPrefix).toMatch(/\?q=$/);
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

    /** The browser's engine is reached through chrome.search, never through a URL of ours. */
    it("builds no address for the browser's own engine", () => {
        expect(buildSearchUrl("browser", "weather")).toBeNull();
    });
});

describe("normalizeSearchEngine", () => {

    it("keeps an engine that is on offer", () => {
        expect(normalizeSearchEngine("bing")).toBe("bing");
    });

    it("reads anything else as the browser's own engine", () => {
        expect(normalizeSearchEngine(undefined)).toBe("browser");
        expect(normalizeSearchEngine("altavista")).toBe("browser");
        expect(searchEngineOf("altavista").kind).toBe("browser");
    });
});
