
import { BackgroundWorker, WorkerMessage } from './abstract/BackgroundWorker'
import { FavIconWorker } from './module/favIconWorker'
import {OpenGroupedTabsWorker} from "./module/openGroupedTabsWorker";
import {OpenTabsWorker} from "./module/openTabsWorker";
import {UsageStatsWorker} from "./module/usageStatsWorker";
import {registerLinkTabGroupCatcher} from "./module/linkTabGroupCatcher";
import {registerBookmarkContextMenu} from "./module/bookmarkCurrentPage";
import {registerClosedTabsRecorder} from "./module/closedTabsRecorder";
import {registerHistoryRecorder} from "./module/historyRecorder";

type ModuleConstructor = new () => BackgroundWorker<any, any>;

class WorkerRouter {
  private instances = new Map<string, BackgroundWorker>();

  constructor(
      private registry: Record<string, ModuleConstructor>
  ) {}

  async dispatch(message: WorkerMessage) {
    const { target, action, payload } = message;

    const Module = this.registry[target];
    if (!Module) {
      return {
        success: false,
        error: { code: "MODULE_NOT_FOUND", message: target },
      };
    }

    let instance = this.instances.get(target);
    if (!instance) {
      instance = new Module();
      this.instances.set(target, instance);
    }

    try {
      return await instance.handle(action, payload);
    } catch (e: any) {
      return instance["errorResponse"](
          "UNHANDLED_ERROR",
          e.message ?? "Unknown error"
      );
    }
  }
}

const router = new WorkerRouter({
  favicon: FavIconWorker,
  openGroupedTabs: OpenGroupedTabsWorker,
  openTabs: OpenTabsWorker,
  usageStats: UsageStatsWorker
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.dispatch(message).then(sendResponse);
  return true; // asynchronous
});

// Registered here, at the top level, because that is what Chrome restarts a stopped
// service worker for. A listener attached any later would only ever run while the worker
// happened to be awake already.
registerLinkTabGroupCatcher();
registerBookmarkContextMenu();
registerClosedTabsRecorder();
registerHistoryRecorder();
