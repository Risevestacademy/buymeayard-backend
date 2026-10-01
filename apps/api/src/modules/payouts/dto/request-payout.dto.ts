import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestPayoutDto {
  @ApiProperty({
    description:
      'Withdrawal amount in minor units (kobo, e.g. 500000 = NGN 5,000.00)',
    example: 500000,
  })
  @IsInt()
  @Min(10000, {
    message: 'Minimum withdrawal amount is 10,000 kobo (NGN 100.00)',
  })
  amount: number;

  @ApiPropertyOptional({
    description: 'ISO currency code (default: NGN)',
    example: 'NGN',
    default: 'NGN',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreatorBalanceResponseDto {
  @ApiProperty({
    description:
      'Funds currently available for immediate withdrawal in minor units (kobo)',
    example: 750000,
  })
  availableBalance: number;

  @ApiProperty({
    description:
      'Funds currently locked in pending/processing payouts in minor units (kobo)',
    example: 200000,
  })
  pendingBalance: number;

  @ApiProperty({
    description:
      'Cumulative total of successfully completed withdrawals in minor units (kobo)',
    example: 1500000,
  })
  withdrawnBalance: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'NGN',
  })
  currency: string;
}

export class PayoutResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 500000 })
  amount: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiProperty({ example: 'PROCESSING' })
  status: string;

  @ApiPropertyOptional({ example: 'pstk_trf_12345678' })
  providerReference?: string | null;

  @ApiProperty({ example: '2026-09-30T12:00:00.000Z' })
  requestedAt: Date;

  @ApiPropertyOptional({ example: null })
  processedAt?: Date | null;

  @ApiPropertyOptional({ example: null })
  failureReason?: string | null;
}
