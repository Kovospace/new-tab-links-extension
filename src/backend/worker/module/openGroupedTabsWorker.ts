import {BackgroundWorker} from "../abstract/BackgroundWorker";

export interface OpenGroupedTabsInput {
    urls: string[];
}

export interface OpenGroupedTabsOutput {

}

export class OpenGroupedTabsWorker extends BackgroundWorker<OpenGroupedTabsInput, OpenGroupedTabsOutput> {

    async handle(action: string, payload: OpenGroupedTabsInput) {
        switch (action) {
            case "open":
                this.openTabs(payload.urls);
                return this.response({});
            default:
                return this.errorResponse(
                    "OPEN_GROUPED_TABS_UNKNOWN_ACTION",
                    `Action ${action} not supported`
                );
        }
    }

    private async openTabs(urls: string[]): Promise<void> {
        const tabIds = [];
        // Otvorenie kariet
        for (const url of urls) {
            const tab = await chrome.tabs.create({ url, active: false });
            tabIds.push(tab.id);
        }
        // Vytvorenie skupiny
        const groupId = await chrome.tabs.group({ tabIds });
        // Voliteľne nastaviť názov a farbu skupiny
        await chrome.tabGroups.update(groupId, { title: "Moje karty", color: "blue" });
    }

}