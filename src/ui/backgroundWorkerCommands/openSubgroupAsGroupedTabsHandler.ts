import {sendToWorkerThread} from "../../utils/sendToWorker";
import {OpenGroupedTabsInput, OpenGroupedTabsOutput} from "../../backend/worker/module/openGroupedTabsWorker";

export class OpenSubgroupAsGroupedTabsHandler {

    static async handleGroupedTabsOpen(
        pageUrls: string[], groupTitle: string, groupColor: string = "blue"
    ) {
        await sendToWorkerThread<OpenGroupedTabsInput, OpenGroupedTabsOutput>(
            "openGroupedTabs", "open", {
                urls: pageUrls,
                title: groupTitle,
                color: groupColor,
            });
    }

}