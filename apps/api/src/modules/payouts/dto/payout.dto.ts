import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** The three statuses the Payouts screens show. */
export enum PayoutDisplayStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
}

export const PAYOUT_STATUS_FILTERS = [
  'all',
  'successful',
  'failed',
  'in_progress',
] as const;
export type PayoutStatusFilter = (typeof PAYOUT_STATUS_FILTERS)[number];

export class RequestPayoutDto {
  @ApiProperty({
    example: 4500000,
    description:
      'Amount to withdraw in kobo (₦45,000). The fee is taken out of it.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;
}

export class QuotePayoutQueryDto {
  @ApiProperty({ example: 4500000, description: 'Amount in kobo' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;
}

export class ListPayoutsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @ApiPropertyOptional({
    enum: PAYOUT_STATUS_FILTERS,
    default: 'all',
    description: 'History tab: All, Successful, Failed, In Progress',
  })
  @IsOptional()
  @IsIn(PAYOUT_STATUS_FILTERS)
  status: PayoutStatusFilter = 'all';

  @ApiPropertyOptional({
    enum: ['newest', 'oldest'],
    default: 'newest',
    description: '"Newest first" / "Oldest first", by request date',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort: 'newest' | 'oldest' = 'newest';
}

export class PayoutQuoteDto {
  @ApiProperty({
    example: 4500000,
    description:
      'The amount entered, in kobo. This is what leaves the balance.',
  })
  amount!: number;

  @ApiProperty({
    example: 5000,
    description:
      'Processing fee in kobo, taken out of `amount`: ₦50 up to ₦50,000, ₦100 above. 0 when amount is 0.',
  })
  fee!: number;

  @ApiProperty({
    example: 4495000,
    description:
      '"You’ll receive": amount − fee, in kobo. What reaches the bank.',
  })
  netAmount!: number;

  @ApiProperty({
    example: 100000,
    description: 'Minimum withdrawal in kobo (₦1,000)',
  })
  minimumWithdrawal!: number;

  @ApiProperty({
    example: 4500000,
    description:
      'Available balance right now, in kobo ("Available to withdraw")',
  })
  availableBalance!: number;

  @ApiProperty({
    example: true,
    description:
      'Whether this amount can be withdrawn. Enable **Continue** only when true.',
  })
  isValid!: boolean;

  @ApiProperty({
    enum: ['BELOW_MINIMUM', 'EXCEEDS_BALANCE'],
    nullable: true,
    example: null,
    description:
      'Why the amount is not valid. `BELOW_MINIMUM`: under ₦1,000. `EXCEEDS_BALANCE`: more than the available balance. null when valid.',
  })
  error!: 'BELOW_MINIMUM' | 'EXCEEDS_BALANCE' | null;
}

export class PayoutDestinationDto {
  @ApiProperty({
    example: 'Guaranty Trust Bank',
    nullable: true,
    description:
      'Bank the payout was sent to. A copy taken at request time, so it stays correct after the creator changes account.',
  })
  bankName!: string | null;

  @ApiProperty({
    example: 'SHOSANYA ISAAC OLUWADAMILARE',
    nullable: true,
    description: 'Account name as confirmed by the bank',
  })
  accountName!: string | null;

  @ApiProperty({
    example: '4589',
    nullable: true,
    description: 'Last 4 digits. Display as "•••• 4589".',
  })
  accountNumberLast4!: string | null;
}

export class PayoutDto {
  @ApiProperty({ example: '6f1c2c1e-1b0a-4d8e-9b0e-2f7c9a1d3e4f' })
  id!: string;

  @ApiProperty({
    example: 'PYT-20250925-0041',
    nullable: true,
    description:
      'Transaction reference shown to the creator and support ("Reference", "Transaction ref"). null only for payouts made before references existed.',
  })
  reference!: string | null;

  @ApiProperty({
    enum: PayoutDisplayStatus,
    example: PayoutDisplayStatus.IN_PROGRESS,
    description:
      '`IN_PROGRESS`: sent, waiting for the bank ("Awaiting confirmation"). `SUCCESSFUL`: the bank confirmed it. `FAILED`: it didn’t go through and the full amount was returned to the balance.',
  })
  status!: PayoutDisplayStatus;

  @ApiProperty({
    example: 4500000,
    description:
      'Amount requested ("Withdrawal amount" / "Amount requested"), in kobo. This left the balance.',
  })
  amount!: number;

  @ApiProperty({
    example: 5000,
    description: 'Processing fee in kobo ("Processing fee −₦50")',
  })
  fee!: number;

  @ApiProperty({
    example: 4495000,
    description:
      'amount − fee, in kobo. "You’ll receive" / "Net received" / "Net payout".',
  })
  netAmount!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({
    type: PayoutDestinationDto,
    description: 'The bank account this payout went to ("Destination")',
  })
  destination!: PayoutDestinationDto;

  @ApiProperty({
    example: '2025-09-25T19:12:00.000Z',
    description:
      'When the creator confirmed the withdrawal ("Requested", the history Date column)',
  })
  requestedAt!: Date;

  @ApiProperty({
    example: '2025-09-25T19:23:00.000Z',
    nullable: true,
    description:
      'When the payout became SUCCESSFUL ("Completed") or FAILED. null while IN_PROGRESS.',
  })
  processedAt!: Date | null;
}

export class PayoutBreakdownDto {
  @ApiProperty({ example: 4500000, description: 'Same as `amount`' })
  amountRequested!: number;

  @ApiProperty({ example: 4495000, description: '0 when the payout failed' })
  transferred!: number;

  @ApiProperty({ example: 5000, description: '0 when the payout failed' })
  feeCharged!: number;

  @ApiProperty({
    example: 0,
    description: 'Full amount when the payout failed',
  })
  returnedToBalance!: number;
}

export class PayoutDetailDto extends PayoutDto {
  @ApiProperty({
    type: PayoutBreakdownDto,
    description: 'The "Payout breakdown" rows for the details drawer',
  })
  breakdown!: PayoutBreakdownDto;

  @ApiProperty({
    example: 'Your bank declined the transfer.',
    nullable: true,
    description:
      'Why it failed, safe to show to the creator ("Your bank declined the transfer"). null unless FAILED.',
  })
  failureReason!: string | null;
}

export class PayoutListDto {
  @ApiProperty({ type: [PayoutDto] })
  items!: PayoutDto[];

  @ApiProperty({ type: PaginationDto })
  pagination!: PaginationDto;
}
