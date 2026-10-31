import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Every field is optional; only the ones sent change. Money is in naira. */
export class AdminUpdateSettingsDto {
  @ApiPropertyOptional({
    example: 10,
    description: 'Platform fee on each contribution, 0-50 (percent)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  platformFeePercent?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Minimum withdrawal in naira',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  minimumWithdrawal?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Withdrawals up to this amount pay the lower fee (naira)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  payoutFeeTierLimit?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Fee up to the tier limit (naira)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payoutFeeUpToLimit?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Fee above the tier limit (naira)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  payoutFeeAboveLimit?: number;
}
