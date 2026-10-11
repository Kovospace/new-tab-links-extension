import { PREMIUM_PLAN_LIMITS } from "./PlanLimits";
import { MAX_NAME_LENGTH, MAX_TITLE_LENGTH } from "../sync/SyncContracts";

/**
 *  A page the user visited, kept for the browsing history card of the side panel.
 *
 *  **A log, like a closed tab, and handled by the same rules** (`ClosedTabEntity.ts`): capped
 *  by the plan, the oldest falling off as new ones arrive, stored exactly as the account holds
 *  it, and kept under a key of its own rather than in the profile's data, because the worker
 *  writes it. Recorded only while the profile has `recordBrowsingHistory` turned on, which it
 *  is not by default.
 *
 *  **One entry per page per day.** Visiting the same address again on the same local day moves
 *  that day's entry to the new time rather than adding another; tomorrow it is a new entry.
 *  Reloads, `#fragment` jumps and in-page navigation would otherwise spend the free plan's fifty
 *  entries in a quarter of an hour, and a history grouped by days still shows a page under
 *  every day it was opened.
 */
export interface Visit {

    /** Identifier, minted here; the backend keys its row by it like every other record. */
    id: string;

    /** Where the page was. Only http(s) is ever recorded - see `isBookmarkableUrl`. */
    url: string;

    /** What the page called itself; empty for a page that never said. */
    title: string;

    /** The page's favicon, when the browser had one for it. */
    faviconUrl?: string;

    /** When it was (last, that day) visited, as epoch milliseconds. The list is ordered by this. */
    visitedAt: number;

    /** The device it was visited on, when that device has a name. */
    deviceName?: string;
}

/**
 *  The most visits the card ever draws: premium's compiled history length. Not the cap a list
 *  is kept to - that is the plan's (`PlanLimits.browsingHistory`), applied in `recordVisit`.
 */
export const MAX_VISITS: number = PREMIUM_PLAN_LIMITS.browsingHistory;

/**
 *  One visit cut down to what the account will accept - a title over 200 characters would be
 *  a 400 for the whole push, exactly as for a closed tab (`storableClosedTab`).
 */
export function storableVisit(visit: Visit): Visit {
    return {
        ...visit,
        title: visit.title.slice(0, MAX_TITLE_LENGTH),
        deviceName: visit.deviceName?.slice(0, MAX_NAME_LENGTH)
    };
}
