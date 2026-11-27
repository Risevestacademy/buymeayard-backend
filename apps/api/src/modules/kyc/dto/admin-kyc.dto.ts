import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { KycSubmissionStatus } from '@buymeayard/types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class KycQueueQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    enum: KycSubmissionStatus,
    default: KycSubmissionStatus.NEEDS_REVIEW,
  })
  @IsOptional()
  @IsEnum(KycSubmissionStatus)
  status?: KycSubmissionStatus;
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
