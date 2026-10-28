export interface PaginationMeta {
  page?: number;
  limit?: number;
  total?: number;
}

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

export type StandardResponse<T> = ApiResponse<T> | ApiErrorResponse;

export function createSuccessResponse<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
  const response: ApiResponse<T> = {
    success: true,
    data
  };
  if (meta) {
    response.meta = meta;
  }
  return response;
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: ApiErrorDetail[]
): ApiErrorResponse {
  const error: ApiErrorPayload = {
    code,
    message
  };
  if (details && details.length > 0) {
    error.details = details;
  }
  return {
    success: false,
    error
  };
}
