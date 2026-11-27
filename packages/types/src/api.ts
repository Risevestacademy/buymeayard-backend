export interface ApiResponse<T = any> {
  data: T;
  meta?: Record<string, any>;
}

export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiPaginatedResponse<T = any> {
  data: {
    items: T[];
    pagination: ApiPagination;
  };
  meta?: Record<string, any>;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, any> | Array<any>;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}
