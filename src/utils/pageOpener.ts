/**
 *  How the side panel opens a page again: in this tab, as a link on the page is, or in a new
 *  one. The browser in normal use, a recorder in a test - jsdom cannot navigate.
 */
export interface PageOpener {
    /** Replaces this new tab page with the address. */
    here(url: string): void;
    /** Opens the address in a tab of its own. */
    newTab(url: string): void;
}

export const BROWSER_PAGE_OPENER: PageOpener = {
    here: url => { window.location.href = url; },
    newTab: url => { void chrome.tabs.create({ url }); }
};

/** Where a reopened page goes. */
export type OpenWhere = "here" | "newTab";

/** Opens the address where asked. */
export function openPage(opener: PageOpener, url: string, where: OpenWhere): void {
    if (where === "newTab") {
        opener.newTab(url);
    } else {
        opener.here(url);
    }
}
