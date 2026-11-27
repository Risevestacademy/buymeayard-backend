import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { SupportStatus } from '@buymeayard/types';
import { AdminDateRangeQueryDto, AdminReasonDto } from '../dto/admin-query.dto';

export class AdminSupportsQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({ enum: SupportStatus })
  @IsOptional()
  @IsEnum(SupportStatus)
  status?: SupportStatus;

  @ApiPropertyOptional({ description: 'Creator profile id' })
  @IsOptional()
  @IsUUID()
  creatorId?: string;
}

export class AdminRefundDto extends AdminReasonDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Refund even if the creator has already withdrawn the money, taking their balance below zero',
  })
  @IsOptional()
  @IsBoolean()
  allowNegativeBalance?: boolean;
}

export class AdminRefundsQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'])
  status?: string;
}
