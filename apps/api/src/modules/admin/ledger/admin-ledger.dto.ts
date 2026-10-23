import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  AccountType,
  LedgerDirection,
  LedgerEntryType,
} from '@buymeayard/types';
import { AdminDateRangeQueryDto } from '../dto/admin-query.dto';

export class AdminLedgerQueryDto extends AdminDateRangeQueryDto {
  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  ownerType?: AccountType;

  @ApiPropertyOptional({ description: 'Creator profile id' })
  @IsOptional()
  @IsUUID()
  creatorId?: string;

  @ApiPropertyOptional({ enum: LedgerEntryType })
  @IsOptional()
  @IsEnum(LedgerEntryType)
  entryType?: LedgerEntryType;

  @ApiPropertyOptional({ enum: LedgerDirection })
  @IsOptional()
  @IsEnum(LedgerDirection)
  direction?: LedgerDirection;

  @ApiPropertyOptional({
    description: 'Payment, payout or refund id the entries belong to',
  })
  @IsOptional()
  @IsString()
  transactionId?: string;
}
