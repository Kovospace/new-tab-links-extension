import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The worker's cache, in memory. IndexedDB is not in jsdom, and what is under test is what
// the worker decides to store and when it asks again - not how the store keeps it.
const cache = new Map<string, unknown>();
vi.mock("../../../../src/backend/repository/FavIconRepository", () => ({
    FavIconRepository: {
        get: async (url: string) => cache.get(url) ?? null,
        save: async (url: string, value: unknown) => { cache.set(url, value); },
        delete: async (url: string) => { cache.delete(url); }
    }
}));

import { FavIconWorker } from "../../../../src/backend/worker/module/favIconWorker";

const PAGE = "https://synced.test/docs";
const PLACEHOLDER = "/gfx/favicon-default.svg";
const HOUR = 60 * 60 * 1000;

/** Bytes Chrome's _favicon endpoint answers with for a page it has no icon for. */
const CHROME_PLACEHOLDER_BYTES = new Uint8Array([1, 1, 1]);
const PNG_BYTES = new Uint8Array([9, 9, 9]);

/**
 *  A fake network. Chrome's favicon cache knows the pages in `chromeKnows`; every other
 *  address answers from `pages`, and anything not listed there is a 404.
 */
let chromeKnows: Set<string>;
let pages: Map<string, Response>;
let requested: string[];

function fakeFetch(input: string | URL): Promise<Response> {
    const url = input.toString();
    if (url.includes("/_favicon/")) {
        const pageUrl = new URL(url).searchParams.get("pageUrl") ?? "";
        return Promise.resolve(new Response(
            chromeKnows.has(pageUrl) ? PNG_BYTES : CHROME_PLACEHOLDER_BYTES));
    }
    requested.push(url);
    return Promise.resolve(pages.get(url)?.clone() ?? new Response("", { status: 404 }));
}

function html(markup: string): Response {
    return new Response(markup, { headers: { "content-type": "text/html" } });
}

function png(): Response {
    return new Response(PNG_BYTES, { headers: { "content-type": "image/png" } });
}

async function getIcon(url: string = PAGE): Promise<string> {
    const response = await new FavIconWorker().handle("get", { url }) as { data: { base64: string } };
    return response.data.base64;
}

beforeEach(() => {
    cache.clear();
    chromeKnows = new Set();
    pages = new Map();
    requested = [];
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

/**
 *  A link synchronised onto a browser that has never visited it finds no icon the first time
 *  it is drawn. What matters is that this is not the last word.
 */
describe("FavIconWorker.get - a link with no icon yet", () => {

    it("picks the icon up once Chrome has one, over a placeholder stored earlier", async () => {
        // How the cache looked for every such link before misses were told apart: the
        // placeholder, stored as though it were the icon, and returned for good.
        cache.set(PAGE, PLACEHOLDER);
        chromeKnows.add(PAGE);

        expect(await getIcon()).toMatch(/^data:image\/png;base64,/);
    });

    it("reads the icon the page declares, with no DOMParser to read it with", async () => {
        // A service worker has none. The lookup that used one fell through to /favicon.ico
        // alone - which this site does not serve - and stored the placeholder.
        vi.stubGlobal("DOMParser", undefined);
        pages.set(PAGE, html(`<head><link rel="icon" href="/static/logo.png"></head>`));
        pages.set("https://synced.test/static/logo.png", png());

        expect(await getIcon()).toMatch(/^data:image\/png;base64,/);
    });

    it("stores a miss as a miss, with the time it happened", async () => {
        pages.set(PAGE, html("<head></head>"));

        expect(await getIcon()).toBe(PLACEHOLDER);
        expect(cache.get(PAGE)).toEqual({ missedAt: expect.any(Number), fallback: PLACEHOLDER });
    });

    it("does not fetch the page again while the last miss is recent", async () => {
        cache.set(PAGE, { missedAt: Date.now() - HOUR, fallback: PLACEHOLDER });

        expect(await getIcon()).toBe(PLACEHOLDER);
        expect(requested).toEqual([]);
    });

    it("fetches the page again once the last miss is old enough", async () => {
        cache.set(PAGE, { missedAt: Date.now() - 7 * HOUR, fallback: PLACEHOLDER });
        pages.set(PAGE, html(`<link rel="icon" href="/static/logo.png">`));
        pages.set("https://synced.test/static/logo.png", png());

        expect(await getIcon()).toMatch(/^data:image\/png;base64,/);
        expect(requested).toContain(PAGE);
    });

    it("leaves a found icon alone, without asking anything", async () => {
        cache.set(PAGE, "data:image/png;base64,AAAA");

        expect(await getIcon()).toBe("data:image/png;base64,AAAA");
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("FavIconWorker.refresh", () => {

    it("fetches the page even when the last miss is recent - the user asked", async () => {
        cache.set(PAGE, { missedAt: Date.now(), fallback: PLACEHOLDER });
        pages.set(PAGE, html(`<link rel="icon" href="/static/logo.png">`));
        pages.set("https://synced.test/static/logo.png", png());

        const response = await new FavIconWorker().handle("refresh", { url: PAGE }) as
            { data: { base64: string } };

        expect(response.data.base64).toMatch(/^data:image\/png;base64,/);
    });
});
