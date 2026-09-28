
/**
 *  The search engines the search bar can send a query to.
 *
 *  A closed list rather than a template the user types: a template is a URL with a
 *  placeholder in it, and a URL typed into a new tab page that is an extension page is a
 *  `javascript:` href waiting to happen. Adding one is adding an entry here.
 *
 *  Names are not translated. They are brands, and a reader looks for the one they know.
 */

export type SearchEngineId = "google" | "duckduckgo" | "bing";

export interface SearchEngine {
    id: SearchEngineId;
    name: string;

    /** The engine's home page; its favicon is what the bar draws for it. */
    homeUrl: string;

    /** Where a query goes, before the query is appended. */
    queryUrlPrefix: string;
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
    {
        id: "google",
        name: "Google",
        homeUrl: "https://www.google.com/",
        queryUrlPrefix: "https://www.google.com/search?q="
    },
    {
        id: "duckduckgo",
        name: "DuckDuckGo",
        homeUrl: "https://duckduckgo.com/",
        queryUrlPrefix: "https://duckduckgo.com/?q="
    },
    {
        id: "bing",
        name: "Bing",
        homeUrl: "https://www.bing.com/",
        queryUrlPrefix: "https://www.bing.com/search?q="
    }
];

/** What a browser nobody has chosen for searches with: the first on the list. */
export const DEFAULT_SEARCH_ENGINE: SearchEngineId = SEARCH_ENGINES[0].id;

/**
 *  The engine a stored value names, or the default.
 *
 *  An engine removed from the list, or storage written by a newer version that has one this
 *  does not, reads as the default rather than as a bar that cannot search.
 */
export function normalizeSearchEngine(value?: string | null): SearchEngineId {
    return SEARCH_ENGINES.find(engine => engine.id === value)?.id ?? DEFAULT_SEARCH_ENGINE;
}

/** The engine itself, for an id that may not be one. */
export function searchEngineOf(id?: string | null): SearchEngine {
    const wanted = normalizeSearchEngine(id);
    return SEARCH_ENGINES.find(engine => engine.id === wanted) ?? SEARCH_ENGINES[0];
}

/**
 *  Where a query is sent, or null when there is nothing to search for.
 *
 *  @param engineId which engine
 *  @param query    what the user typed; surrounding whitespace is not part of it
 */
export function buildSearchUrl(engineId: string, query: string): string | null {
    const trimmed = query.trim();
    if (!trimmed) {
        return null;
    }
    return searchEngineOf(engineId).queryUrlPrefix + encodeURIComponent(trimmed);
}
