import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PayoutStatus } from '@buymeayard/types';
import { AdminDateRangeQueryDto } from '../dto/admin-query.dto';

export class AdminPayoutsQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({
    enum: PayoutStatus,
    description: 'The stored payout status',
  })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @ApiPropertyOptional({ description: 'Creator profile id' })
  @IsOptional()
  @IsUUID()
  creatorId?: string;
}
