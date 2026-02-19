import {WorkerMessage} from "../backend/worker/abstract/BackgroundWorker";

export function sendToWorkerThread<PAYLOAD_TYPE, RESULT_TYPE>(
    target: string,
    action: string,
    payload: PAYLOAD_TYPE
): Promise<RESULT_TYPE> {
  return new Promise<RESULT_TYPE>((resolve, reject) => {
    chrome.runtime.sendMessage(
        {
          target: target,
          action: action,
          payload: payload
        } satisfies WorkerMessage<PAYLOAD_TYPE>,
        (result: RESULT_TYPE) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        }
    );
  });
}