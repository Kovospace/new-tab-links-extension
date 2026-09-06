/**
 *  Putting tabs into the Chrome tab group that stands for a subgroup.
 *
 *  A subgroup's tab group is identified by its title within one window, and reused rather
 *  than re-created. That is what lets links opened one at a time from anywhere in the
 *  browser end up beside the ones opened together from the subgroup menu, instead of in a
 *  second group with the same name.
 */

/** chrome.tabGroups.TAB_GROUP_ID_NONE, without reaching into the API for a constant. */
export const TAB_GROUP_NONE = -1;

/** The colours Chrome paints a tab group with, as the API accepts them. */
export type TabGroupColor = `${chrome.tabGroups.Color}`;

/** The colour a subgroup's tab group gets until subgroups carry a colour of their own. */
export const DEFAULT_TAB_GROUP_COLOR: TabGroupColor = "blue";

/**
 *  Grouping runs one call at a time.
 *
 *  Two tabs finishing their navigation in the same instant would otherwise both look for the
 *  group, both fail to find it, and both create one - leaving two identically named groups
 *  and the links split between them.
 */
let pending: Promise<unknown> = Promise.resolve();

function queued<RESULT>(work: () => Promise<RESULT>): Promise<RESULT> {
    // Both arms run `work`: a failure of the previous call must not cancel this one.
    const result = pending.then(work, work);
    pending = result.catch(() => undefined);
    return result;
}

/**
 *  Moves tabs into the tab group named `title`, creating that group when the window has none.
 *
 *  @param title      the subgroup's title, which names the tab group
 *  @param tabIds     the tabs to place; an empty list does nothing
 *  @param windowId   the window to look in and create in; the current one when absent
 *  @param color      the colour to paint a newly created group
 */
export function groupTabsUnderTitle(
    title: string,
    tabIds: number[],
    windowId?: number,
    color: TabGroupColor = DEFAULT_TAB_GROUP_COLOR
): Promise<void> {

    if (tabIds.length === 0) {
        return Promise.resolve();
    }

    return queued(async () => {
        const tabs = tabIds as [number, ...number[]];

        const existing = await chrome.tabGroups.query(
            windowId === undefined ? { title } : { title, windowId });

        if (existing.length > 0) {
            await chrome.tabs.group({ tabIds: tabs, groupId: existing[0].id });
            return;
        }

        const groupId = await chrome.tabs.group(
            windowId === undefined
                ? { tabIds: tabs }
                : { tabIds: tabs, createProperties: { windowId } });

        await chrome.tabGroups.update(groupId, { title, color });
    });
}
