import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** Every field is optional; only the ones sent change. Money is in kobo. */
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
    example: 100000,
    description: 'Minimum withdrawal in kobo',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minimumWithdrawal?: number;

  @ApiPropertyOptional({
    example: 5000000,
    description: 'Withdrawals up to this amount pay the lower fee (kobo)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  payoutFeeTierLimit?: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Fee up to the tier limit (kobo)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  payoutFeeUpToLimit?: number;

  @ApiPropertyOptional({
    example: 10000,
    description: 'Fee above the tier limit (kobo)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  payoutFeeAboveLimit?: number;
}
