import { CursorPaginationDto, PaginationDto } from '../dto/pagination.dto';

export function buildPagination(
  page: number,
  limit: number,
  total: number,
): PaginationDto {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

export function buildCursorPagination(
  limit: number,
  nextCursor: string | null,
): CursorPaginationDto {
  return { limit, nextCursor };
}
