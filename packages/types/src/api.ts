export interface ApiResponse<T = any> {
  data: T;
  meta?: Record<string, any>;
}

export interface ApiPaginatedResponse<T = any> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, any> | Array<any>;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}
