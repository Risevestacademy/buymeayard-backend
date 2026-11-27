import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AdminListQueryDto } from '../dto/admin-query.dto';

export const REPORT_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED',
] as const;

export class AdminReportsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: (typeof REPORT_STATUSES)[number];
}

export class AdminUpdateReportDto {
  @ApiProperty({ enum: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'] })
  @IsIn(['UNDER_REVIEW', 'RESOLVED', 'REJECTED'])
  status!: 'UNDER_REVIEW' | 'RESOLVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Internal note (admins only)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description:
      'With RESOLVED: archive the reported post so it is no longer shown',
  })
  @IsOptional()
  @IsBoolean()
  removeContent?: boolean;
}
