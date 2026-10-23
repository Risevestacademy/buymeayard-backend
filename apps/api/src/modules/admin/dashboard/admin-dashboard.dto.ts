import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class AdminSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-01',
    description:
      'Start of the range (Lagos time). Defaults to the 1st of this month.',
  })
  @IsOptional()
  @Matches(DAY, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-22',
    description: 'End of the range, inclusive. Defaults to today.',
  })
  @IsOptional()
  @Matches(DAY, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({
    default: 8,
    minimum: 2,
    maximum: 26,
    description: 'Weeks shown in the contribution volume chart',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(26)
  weeks: number = 8;
}
