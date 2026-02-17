
export interface BackgroundMessage<TPayload = unknown> {
  target: string;        // názov modulu (class)
  action: string;        // názov metódy
  payload: TPayload;     // DTO
  requestId?: string;    // optional correlation id
}

export interface BackgroundResponse<T = unknown> {
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
  ): Promise<TResult>;

  protected response(data: TResult): BackgroundResponse<TResult> {
    return {
      success: true,
      data,
    };
  }

  protected errorResponse(
    code: string,
    message: string
  ): BackgroundResponse {
    return {
      success: false,
      error: { code, message },
    };
  }
}