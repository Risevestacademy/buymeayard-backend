import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycSubmissionStatus } from '@buymeayard/types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class KycQueueQueryDto {
  @ApiPropertyOptional({
    enum: KycSubmissionStatus,
    default: KycSubmissionStatus.NEEDS_REVIEW,
  })
  @IsOptional()
  @IsEnum(KycSubmissionStatus)
  status?: KycSubmissionStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class AdminKycApproveDto {
  @ApiPropertyOptional({ description: 'Internal note (admins only)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AdminKycRejectDto {
  @ApiProperty({ description: 'Reason shown to the creator' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Internal note (admins only)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}
