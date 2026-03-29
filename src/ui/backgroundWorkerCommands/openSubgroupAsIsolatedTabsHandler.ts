import {sendToWorkerThread} from "../../utils/sendToWorker";
import {OpenTabsInput, OpenTabsOutput} from "../../backend/worker/module/openTabsWorker";

export class OpenSubgroupAsIsolatedTabsHandler {

    static async handleIsolatedTabsOpen(pageUrls: string[]) {
        await sendToWorkerThread<OpenTabsInput, OpenTabsOutput>(
            "openTabs", "open", {
                urls: pageUrls,
            });
    }

}