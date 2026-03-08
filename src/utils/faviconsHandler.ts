import { GetFaviconOutput, GetFaviconInput } from "../backend/worker/module/favIconWorker"
import { FavIconRepository } from "../backend/repository/FavIconRepository"
import { sendToWorkerThread } from "./sendToWorker"

export class FaviconsHandler {

  static async handleIconDownloadAndCache(pageUrl: string) {
    await sendToWorkerThread<GetFaviconInput, GetFaviconOutput>(
        "favicon", "get", { url: pageUrl });
    return await FavIconRepository.get(pageUrl);
  }

}
