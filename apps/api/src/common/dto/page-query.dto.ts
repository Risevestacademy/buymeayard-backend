import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/** `limit` for every list, page-based or cursor-based. */
export class LimitQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_PAGE_LIMIT,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: 'Items per page',
  })
  @IsOptional()
  @Type(() => Number) // query params arrive as strings
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit: number = DEFAULT_PAGE_LIMIT;
}

/** `page` + `limit` for page-based lists. Respond with `{ items, pagination }`. */
export class PageQueryDto extends LimitQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}

/** `cursor` + `limit` for cursor-based feeds. Respond with `{ items, pagination }`. */
export class CursorQueryDto extends LimitQueryDto {
  @ApiPropertyOptional({
    description:
      "The previous response's pagination.nextCursor, passed back unchanged",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;
}
