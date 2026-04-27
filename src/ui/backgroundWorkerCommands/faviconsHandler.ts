import { GetFaviconOutput, GetFaviconInput } from "../../backend/worker/module/favIconWorker"
import { WorkerResponse } from "../../backend/worker/abstract/BackgroundWorker"
import { sendToWorkerThread } from "../../utils/sendToWorker"

export class FaviconsHandler {

  static async handleIconDownloadAndCache(pageUrl: string): Promise<string | null> {
    const response = await sendToWorkerThread<GetFaviconInput, WorkerResponse<GetFaviconOutput>>(
        "favicon", "get", { url: pageUrl });
    return response?.data?.base64 ?? null;
  }

  static async refreshIcon(pageUrl: string): Promise<string | null> {
    const response = await sendToWorkerThread<GetFaviconInput, WorkerResponse<GetFaviconOutput>>(
        "favicon", "refresh", { url: pageUrl });
    return response?.data?.base64 ?? null;
  }

}
