import {BackgroundWorker} from "../abstract/BackgroundWorker";
import {DEFAULT_TAB_GROUP_COLOR, TabGroupColor, groupTabsUnderTitle} from "./tabGroups";

export interface OpenGroupedTabsInput {
    urls: string[];
    title: string;
    color: string;
}

export interface OpenGroupedTabsOutput {
    // dummy
}

export class OpenGroupedTabsWorker extends BackgroundWorker<OpenGroupedTabsInput, OpenGroupedTabsOutput> {

    async handle(action: string, payload: OpenGroupedTabsInput) {
        switch (action) {
            case "open":
                this.openTabs(payload.urls, payload.title, payload.color);
                return this.response({});
            default:
                return this.errorResponse(
                    "OPEN_GROUPED_TABS_UNKNOWN_ACTION",
                    `Action ${action} not supported`
                );
        }
    }

    /**
     * Opens the addresses and puts them all in one tab group.
     *
     * The group is looked up by title before one is created, so that opening a subgroup
     * whose links are also being caught one at a time adds to the group already standing
     * for it rather than starting a rival with the same name. The search is confined to the
     * window the tabs were opened in, so reusing a group never drags them to another one.
     */
    private async openTabs(urls: string[], title: string, color: string): Promise<void> {
        const tabIds: number[] = [];
        let windowId: number | undefined;
        for (const url of urls) {
            const tab = await chrome.tabs.create({ url, active: false });
            if (tab.id !== undefined) {
                tabIds.push(tab.id);
                windowId = tab.windowId;
            }
        }
        await groupTabsUnderTitle(
            title, tabIds, windowId, (color as TabGroupColor) || DEFAULT_TAB_GROUP_COLOR);
    }

}