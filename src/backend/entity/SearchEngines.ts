
/**
 *  The search engines the search bar can send a query to.
 *
 *  **The browser's own engine comes first and is the default**, because the Chrome Web Store
 *  requires it: a new tab page with web search "must respect the user's existing web search
 *  settings by using the Chrome Search API", and a list of providers "must default to the web
 *  search provider the user has listed in their settings". That engine is searched through
 *  `chrome.search.query`, which does not say which engine it is - so it has no name or icon of
 *  its own, and the interface calls it "Default search engine".
 *
 *  The others are opened as their plain search URLs. No partner or affiliate parameters, ever:
 *  the store allows those only with a direct benefit to the user, and there is none here.
 *
 *  A closed list rather than a template the user types: a template is a URL with a placeholder
 *  in it, and a URL typed into a new tab page that is an extension page is a `javascript:` href
 *  waiting to happen. Adding one is adding an entry here.
 *
 *  Names are not translated. They are brands, and a reader looks for the one they know.
 */

export type SearchEngineId = "browser" | "google" | "duckduckgo" | "bing";

/** The engine the browser is set to search with, reached through the Chrome Search API. */
export interface BrowserSearchEngine {
    id: "browser";
    kind: "browser";
}

/** An engine reached by opening its search URL. */
export interface WebSearchEngine {
    id: Exclude<SearchEngineId, "browser">;
    kind: "web";
    name: string;

    /** The engine's home page; its favicon is what the bar draws for it. */
    homeUrl: string;

    /** Where a query goes, before the query is appended. */
    queryUrlPrefix: string;
}

export type SearchEngine = BrowserSearchEngine | WebSearchEngine;

export const BROWSER_SEARCH_ENGINE: BrowserSearchEngine = { id: "browser", kind: "browser" };

export const SEARCH_ENGINES: readonly SearchEngine[] = [
    BROWSER_SEARCH_ENGINE,
    {
        id: "google",
        kind: "web",
        name: "Google",
        homeUrl: "https://www.google.com/",
        queryUrlPrefix: "https://www.google.com/search?q="
    },
    {
        id: "duckduckgo",
        kind: "web",
        name: "DuckDuckGo",
        homeUrl: "https://duckduckgo.com/",
        queryUrlPrefix: "https://duckduckgo.com/?q="
    },
    {
        id: "bing",
        kind: "web",
        name: "Bing",
        homeUrl: "https://www.bing.com/",
        queryUrlPrefix: "https://www.bing.com/search?q="
    }
];

/** What a browser nobody has chosen for searches with: its own engine. */
export const DEFAULT_SEARCH_ENGINE: SearchEngineId = BROWSER_SEARCH_ENGINE.id;

/**
 *  The engine a stored value names, or the default.
 *
 *  An engine removed from the list, or storage written by a newer version that has one this
 *  does not, reads as the browser's own engine rather than as a bar that cannot search.
 */
export function normalizeSearchEngine(value?: string | null): SearchEngineId {
    return SEARCH_ENGINES.find(engine => engine.id === value)?.id ?? DEFAULT_SEARCH_ENGINE;
}

/** The engine itself, for an id that may not be one. */
export function searchEngineOf(id?: string | null): SearchEngine {
    const wanted = normalizeSearchEngine(id);
    return SEARCH_ENGINES.find(engine => engine.id === wanted) ?? BROWSER_SEARCH_ENGINE;
}

/**
 *  Where a query is sent with an engine that has a search URL, or null when there is nothing
 *  to search for - or when the engine is the browser's own, which has no URL to build.
 *
 *  @param engineId which engine
 *  @param query    what the user typed; surrounding whitespace is not part of it
 */
export function buildSearchUrl(engineId: string, query: string): string | null {
    const trimmed = query.trim();
    const engine = searchEngineOf(engineId);
    if (!trimmed || engine.kind !== "web") {
        return null;
    }
    return engine.queryUrlPrefix + encodeURIComponent(trimmed);
}
