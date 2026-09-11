/**
 *  A tab the user closed, kept so it can be found again.
 *
 *  **This is a log, not data.** Everything else this extension stores is something the user
 *  made and would miss; a closed tab is something that happened. That difference is why the
 *  rules below are what they are: the list is capped, the oldest entries fall off it without
 *  ceremony, and the same address closed twice is one entry rather than two.
 */
export interface ClosedTab {

    /** Identifier, minted here; the backend keys its row by it like every other record. */
    id: string;

    /** Where the tab was. Only http(s) is ever recorded - see `isBookmarkableUrl`. */
    url: string;

    /** What the page called itself; empty for a page that never said. */
    title: string;

    /** The tab's own favicon, when the browser had one for it. */
    faviconUrl?: string;

    /** When it was closed, as epoch milliseconds. The list is ordered by this. */
    closedAt: number;

    /**
     *  The device it was closed on, when that device has a name.
     *
     *  Kept so the panel can say where something happened, which is the whole reason for
     *  synchronising this: a tab closed on the laptop is worth finding from the desktop, and
     *  worth telling apart from one closed here.
     */
    deviceName?: string;
}

/**
 *  How many closed tabs one profile keeps.
 *
 *  A cap rather than a full history, and a small one. Every entry is pushed to the account and
 *  travels to every other device, so an uncapped list would be a browsing history in somebody
 *  else's database growing without limit. Fifty is enough to answer "what was that thing I
 *  just closed" - which is the question this panel exists for - and no more than that.
 */
export const MAX_CLOSED_TABS = 50;
