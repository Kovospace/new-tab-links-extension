import { MAX_NAME_LENGTH, MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "../sync/SyncContracts";

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

/**
 *  One closed tab cut down to what the account will accept.
 *
 *  **A page title longer than 200 characters is not one rejected row - it is a 400 for the
 *  whole push.** The backend validates `@Size` over the entire request, so one long title
 *  would stop every other change on the device from reaching the account until somebody
 *  found it. Chrome page titles run past 200 characters routinely; news sites do it daily.
 *
 *  Cutting rather than refusing, because a truncated title is still a useful one and the
 *  address is what the entry is for. An address that is itself too long is the one thing
 *  that cannot be saved at all - see `recordClosedTab`, which refuses it.
 *
 *  @param tab the entry as it was recorded
 *  @return the same entry, storable
 */
export function storableClosedTab(tab: ClosedTab): ClosedTab {
    return {
        ...tab,
        title: tab.title.slice(0, MAX_TITLE_LENGTH),
        deviceName: tab.deviceName?.slice(0, MAX_NAME_LENGTH)
    };
}

/**
 *  Whether an address can be kept at all.
 *
 *  The column is 2048 characters and the check is on the push, so a longer one would fail the
 *  batch. Nothing can be trimmed off an address without changing where it points, so an entry
 *  like this is not recorded.
 */
export function isStorableClosedTabUrl(url: string): boolean {
    return url.length > 0 && url.length <= MAX_URL_LENGTH;
}
