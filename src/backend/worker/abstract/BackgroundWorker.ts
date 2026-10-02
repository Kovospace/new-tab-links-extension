
export interface WorkerMessage<TPayload = unknown> {
  target: string;        // názov modulu (class)
  action: string;        // názov metódy
  payload: TPayload;     // DTO
  requestId?: string;    // optional correlation id
}

export interface WorkerResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  requestId?: string;
}

export abstract class BackgroundWorker<
  TPayload = unknown,
  TResult = unknown
> {
  abstract handle(
    action: string,
    payload: TPayload
  ): Promise<WorkerResponse<TResult> | WorkerResponse>;

  protected response(data: TResult): WorkerResponse<TResult> {
    return {
      success: true,
      data,
    };
  }

  protected errorResponse(
    code: string,
    message: string
  ): WorkerResponse {
    return {
      success: false,
      error: { code, message },
    };
  }
}