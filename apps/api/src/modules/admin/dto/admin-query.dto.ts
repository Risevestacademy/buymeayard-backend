import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Shared `page` / `limit` / `search` for admin lists. */
export class AdminListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive date range in Lagos time, as YYYY-MM-DD. */
export class AdminDateRangeQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-22' })
  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

/** Why an admin took an action. Stored in the audit log. */
export class AdminReasonDto {
  @ApiProperty({ example: 'Violated community guidelines' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

/** Start of the Lagos day (UTC+1, no DST) as a Date. */
export function lagosDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+01:00`);
}

/** Exclusive end of the Lagos day. */
export function lagosDayEnd(day: string): Date {
  return new Date(lagosDayStart(day).getTime() + 24 * 3600 * 1000);
}

export function lagosDay(date: Date): string {
  return new Date(date.getTime() + 3600 * 1000).toISOString().slice(0, 10);
}
