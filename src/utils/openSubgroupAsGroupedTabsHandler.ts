import {sendToWorkerThread} from "./sendToWorker";
import {OpenGroupedTabsInput, OpenGroupedTabsOutput} from "../backend/worker/module/openGroupedTabsWorker";

export class OpenSubgroupAsGroupedTabsHandler {

    static async handleGroupedTabsOpen(pageUrls: string[]) {
        await sendToWorkerThread<OpenGroupedTabsInput, OpenGroupedTabsOutput>(
            "openGroupedTabs", "open", { urls: pageUrls });
    }

}