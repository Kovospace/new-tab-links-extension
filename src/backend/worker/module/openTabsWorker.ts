import {BackgroundWorker} from "../abstract/BackgroundWorker";

export interface OpenTabsInput {
    urls: string[];
}

export interface OpenTabsOutput {
    // dummy
}

export class OpenTabsWorker extends BackgroundWorker<OpenTabsInput, OpenTabsOutput> {

    async handle(action: string, payload: OpenTabsInput) {
        switch (action) {
            case "open":
                await this.openTabs(payload.urls);
                return this.response({});
            default:
                return this.errorResponse(
                    "OPEN_TABS_UNKNOWN_ACTION",
                    `Action ${action} not supported`
                );
        }
    }

    private async openTabs(urls: string[]): Promise<void> {
        for (const url of urls) {
            await chrome.tabs.create({ url, active: false });
        }
    }
}