
import { BackgroundWorker } from './abstract/BackgroundWorker'
import { FavIconWorker } from './module/favIconWorker'

type ModuleConstructor = new () => BackgroundModule<any, any>;

class WorkerRouter {
  private instances = new Map<string, BackgroundWorker>();

  constructor(
      private registry: Record<string, ModuleConstructor>
  ) {}

  async dispatch(message: BackgroundMessage) {
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
  favicon: FavIconWorker
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router.dispatch(message).then(sendResponse);
  return true; // asynchronous
});
