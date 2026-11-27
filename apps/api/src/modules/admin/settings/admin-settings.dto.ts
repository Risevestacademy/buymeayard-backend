import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';

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
    example: 1.5,
    description:
      "Bachs's card-processing fee, 0-50 (percent). Added on top of the gift, so the supporter pays it",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  collectionFeePercent?: number;

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

  @ApiPropertyOptional({
    example: { USD: 1500, GHS: 100, KES: 11.5 },
    description:
      'Naira per 1 unit of each currency supporters can pay in (USD, GHS, KES). A currency is offered once it has a rate; NGN is always available. Replaces the whole list, so send every rate you want to keep. Include your margin: Bachs converts at its own rate when the payment settles.',
  })
  @IsOptional()
  @IsObject()
  currencyRates?: Record<string, number>;
}
