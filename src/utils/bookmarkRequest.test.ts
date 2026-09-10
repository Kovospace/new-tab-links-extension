import { describe, expect, it, vi } from "vitest";

import {
    isBookmarkableUrl,
    requestForActiveTab,
    storePendingBookmark,
    takePendingBookmark
} from "./bookmarkRequest";

/** The stub's tabs API, typed enough to say what the next query should answer. */
const tabs = (globalThis as unknown as {
    chrome: { tabs: { query: ReturnType<typeof vi.fn> } }
}).chrome.tabs;

/**
 *  The handover between the service worker, which can see the tab, and the popup, which can
 *  draw a form. A popup takes no argument, so the request is left where the popup will look
 *  for it - and anything wrong here reaches the user as a bookmark of the wrong page, or of a
 *  page they were looking at a quarter of an hour ago.
 */
describe("bookmarkRequest", () => {

    it("hands the page over as it was given", async () => {
        const request = {
            url: "https://example.com/search?q=a+b&lang=sk#top",
            title: "Example — hľadanie & výsledky",
            favIconUrl: "https://example.com/favicon.ico"
        };

        await storePendingBookmark(request);

        expect(await takePendingBookmark()).toEqual(request);
    });

    it("answers a request once", async () => {
        // Taken, not read. A popup that is dismissed and opened again from the toolbar icon
        // means "the page I am on now", and must not inherit the last right-click.
        await storePendingBookmark({ url: "https://example.com/", title: "Example" });

        expect(await takePendingBookmark()).not.toBeNull();
        expect(await takePendingBookmark()).toBeNull();
    });

    it("refuses a request left behind a quarter of an hour ago", async () => {
        vi.useFakeTimers();
        try {
            await storePendingBookmark({ url: "https://example.com/", title: "Example" });
            vi.advanceTimersByTime(15 * 60 * 1000);

            expect(await takePendingBookmark()).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it("has nothing to answer when the worker left nothing", async () => {
        expect(await takePendingBookmark()).toBeNull();
    });

    it("falls back to the tab the popup is standing on", async () => {
        tabs.query.mockResolvedValueOnce([{
            url: "https://example.com/",
            title: "Example",
            favIconUrl: "https://example.com/favicon.ico"
        }]);

        expect(await requestForActiveTab()).toEqual({
            url: "https://example.com/",
            title: "Example",
            favIconUrl: "https://example.com/favicon.ico"
        });
    });

    it("refuses a tab that is not an ordinary page", async () => {
        tabs.query.mockResolvedValueOnce([{ url: "chrome://newtab/", title: "New tab" }]);

        expect(await requestForActiveTab()).toBeNull();
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
