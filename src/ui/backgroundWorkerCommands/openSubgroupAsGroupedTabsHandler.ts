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

    /**
     *  Repaints the tab group standing for a subgroup, if one is open.
     *
     *  Asked for when the colour is changed, so the tab strip agrees with the page at once
     *  rather than at the next opening.
     */
    static async handleGroupRecolor(groupTitle: string, groupColor: string) {
        await sendToWorkerThread<OpenGroupedTabsInput, OpenGroupedTabsOutput>(
            "openGroupedTabs", "recolor", {
                urls: [],
                title: groupTitle,
                color: groupColor,
            });
    }

}