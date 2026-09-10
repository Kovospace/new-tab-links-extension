import { describe, expect, it } from "vitest";

import {
    buildBookmarkPageUrl,
    isBookmarkableUrl,
    readBookmarkRequest
} from "./bookmarkRequest";

/**
 *  The address is the whole handover between the service worker, which can see the tab, and
 *  the window, which can draw a form. Anything lost or mangled here reaches the user as a
 *  bookmark of the wrong page, or as a window that opens on nothing.
 */
describe("bookmarkRequest", () => {

    it("carries the page through the address unchanged", () => {
        const request = {
            url: "https://example.com/search?q=a+b&lang=sk#top",
            title: "Example — hľadanie & výsledky",
            favIconUrl: "https://example.com/favicon.ico"
        };

        const parsed = readBookmarkRequest(
            new URL(buildBookmarkPageUrl(request)).search);

        expect(parsed).toEqual(request);
    });

    it("leaves out a favicon too large to travel in an address", () => {
        // A page may declare its icon as a data: URI holding the whole image. The window can
        // ask the favicon worker instead, so an oversized one is dropped rather than carried.
        const parsed = readBookmarkRequest(new URL(buildBookmarkPageUrl({
            url: "https://example.com/",
            title: "Example",
            favIconUrl: `data:image/png;base64,${"A".repeat(4096)}`
        })).search);

        expect(parsed?.url).toBe("https://example.com/");
        expect(parsed?.favIconUrl).toBeUndefined();
    });

    it("reads a page with no title as one with an empty name", () => {
        const parsed = readBookmarkRequest(new URL(buildBookmarkPageUrl({
            url: "https://example.com/",
            title: ""
        })).search);

        expect(parsed?.title).toBe("");
    });

    it("refuses an address that names nothing bookmarkable", () => {
        expect(readBookmarkRequest("")).toBeNull();
        expect(readBookmarkRequest("?url=chrome%3A%2F%2Fextensions")).toBeNull();
        expect(readBookmarkRequest("?url=not-an-address")).toBeNull();
    });

    it("offers only http and https", () => {
        expect(isBookmarkableUrl("http://example.com/")).toBe(true);
        expect(isBookmarkableUrl("https://example.com/")).toBe(true);

        // The new tab page is one of these, and it is where the shortcut is most likely to
        // be pressed without a page in mind.
        expect(isBookmarkableUrl("chrome://newtab/")).toBe(false);
        expect(isBookmarkableUrl("chrome-extension://abc/index.html")).toBe(false);
        expect(isBookmarkableUrl("file:///home/user/notes.txt")).toBe(false);
        expect(isBookmarkableUrl("about:blank")).toBe(false);
        expect(isBookmarkableUrl(undefined)).toBe(false);
    });
});
