import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { PayoutMethodDto } from '../../payouts/dto/payout-method.dto';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsIn,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Creator Context
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardCreatorContextDto {
  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Creator profile unique ID',
  })
  id!: string;

  @ApiPropertyOptional({
    example: 'Fisayo Rotibi',
    description: 'Creator display name',
    nullable: true,
  })
  creatorName?: string | null;

  @ApiProperty({
    example: 'aesthetefisayo',
    description: 'Unique slug / handle of creator',
  })
  slug!: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/avatar.jpg',
    description: 'Creator avatar image URL',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Account status (e.g. ACTIVE, PROFILE_CREATED, KYC_PENDING)',
  })
  status!: string;

  @ApiProperty({
    example: true,
    description: 'Whether creator page is published publicly',
  })
  isPublished!: boolean;

  @ApiProperty({
    example: 'LIVE',
    description: 'Computed status badge (LIVE, DRAFT, PUBLISHED, SUSPENDED)',
  })
  pageStatus!: string;

  @ApiProperty({
    example: 'Page is live',
    description: 'Human readable status label for UI badge',
  })
  pageStatusLabel!: string;

  @ApiProperty({
    example: 'https://buymeayard.com/aesthetefisayo',
    description: 'Public URL to creator yard page',
  })
  publicUrl!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Summary Metrics (KPI Cards)
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardMetricsDto {
  @ApiProperty({
    example: 24,
    description: 'Total number of contributions received to date',
  })
  totalContributions!: number;

  @ApiProperty({
    example: 120000,
    description:
      'Total contribution amount before charges in naira (e.g. 120000 = ₦120,000)',
  })
  totalContributionAmount!: number;

  @ApiProperty({
    example: 114000,
    description:
      'Total net earnings after platform charges in naira (e.g. 114000 = ₦114,000)',
  })
  netEarnings!: number;

  @ApiProperty({
    example: 6000,
    description:
      'Total platform processing and service fees deducted in naira (e.g. 6000 = ₦6,000)',
  })
  platformFees!: number;

  @ApiProperty({
    example: 18,
    description:
      'People who have gifted this creator, counted by email (Supporters card). A gift without an email counts as one person.',
  })
  supporters!: number;

  @ApiProperty({
    example: 4,
    description:
      'Supporters whose first gift arrived this month (UTC), not counting people who gifted before ("new this month")',
  })
  newSupportersThisMonth!: number;

  @ApiProperty({
    example: 3,
    description: 'Contributions received since the start of this month (UTC)',
  })
  thisMonthContributions!: number;

  @ApiProperty({
    example: 68500,
    description: 'Amount contributed this month, in naira ("This month" card)',
  })
  thisMonthAmount!: number;

  @ApiProperty({
    example: 61000,
    description: 'Amount contributed last month, in naira',
  })
  lastMonthAmount!: number;

  @ApiProperty({
    example: 12,
    nullable: true,
    type: Number,
    description:
      'This month vs last month, in whole percent (negative when down). Null when nothing was received last month.',
  })
  thisMonthChangePercent!: number | null;

  @ApiProperty({
    example: 'NGN',
    description: 'ISO currency code',
  })
  currency!: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Balance Breakdown (Balance Card)
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardBalanceDto {
  @ApiProperty({
    example: 72000,
    description:
      '"Available balance / Ready to withdraw", in naira (e.g. 72000 = ₦72,000). Withdrawals in progress are already taken out.',
  })
  availableBalance!: number;

  @ApiProperty({
    example: 12000,
    description:
      'Contributions still processing (checkout opened in the last hour, not yet confirmed by Paystack), in naira',
  })
  pendingBalance!: number;

  @ApiProperty({
    example: 30000,
    description:
      'Total sent to the bank account to date, after processing fees, in naira (e.g. 30000 = ₦30,000)',
  })
  withdrawnToDate!: number;

  @ApiProperty({
    example: 'NGN',
    description: 'ISO currency code',
  })
  currency!: string;

  @ApiProperty({
    example: true,
    description:
      'Whether creator can withdraw now (KYC verified, active, balance at least the minimum, and a verified payout account)',
  })
  canWithdraw!: boolean;

  @ApiProperty({
    example: 'VERIFIED',
    description:
      'Identity verification status: NOT_SUBMITTED, PENDING, VERIFIED, REJECTED, NEEDS_REVIEW, EXPIRED. Only VERIFIED can add a bank account or withdraw.',
  })
  kycStatus!: string;

  @ApiProperty({
    example: true,
    description: 'Whether a verified payout bank account is saved',
  })
  hasPayoutMethod!: boolean;

  @ApiProperty({
    example: 1000,
    description: 'Minimum withdrawal in naira (₦1,000)',
  })
  minimumWithdrawal!: number;

  @ApiProperty({
    enum: ['VERIFY_IDENTITY', 'CONNECT_BANK', 'READY'],
    example: 'READY',
    description:
      'Which "A little setup. Then, you’re ready." step the creator is on',
  })
  setupStep!: 'VERIFY_IDENTITY' | 'CONNECT_BANK' | 'READY';

  @ApiProperty({
    type: () => PayoutMethodDto,
    nullable: true,
    description: 'The bank account payouts are sent to',
  })
  payoutMethod!: PayoutMethodDto | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Supporter & Material for Contributions
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardContributionSupporterDto {
  @ApiPropertyOptional({
    example: 'u-1234',
    description: 'Always null: supporters are guests and have no user ID',
    nullable: true,
  })
  id?: string | null;

  @ApiProperty({
    example: 'Ada Okafor',
    description: 'Supporter display name or "Anonymous"',
  })
  name!: string;

  @ApiProperty({
    example: 'AO',
    description: 'Initials for avatar placeholder',
  })
  initials!: string;

  @ApiPropertyOptional({
    example: 'https://cdn.buymeayard.com/avatars/supporter.jpg',
    description: 'Avatar image URL if supporter has one',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({
    example: false,
    description: 'Whether contribution was made anonymously',
  })
  isAnonymous!: boolean;
}

export class DashboardContributionMaterialDto {
  @ApiPropertyOptional({
    description:
      'Platform material id (e.g. Adire), for picking the swatch. Stays the same if the creator renames the fabric.',
  })
  id?: string;

  @ApiProperty({
    example: 'Ankara',
    description: 'Material / fabric name',
  })
  name!: string;

  @ApiPropertyOptional({
    example: '#D46331',
    description: 'Material color swatch hex code',
    nullable: true,
  })
  color?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.buymeayard.com/materials/ankara-sm.png',
    description: 'Thumbnail / icon URL of material',
    nullable: true,
  })
  thumbnailUrl?: string | null;

  @ApiProperty({
    example: 1,
    description: 'Number of yards gifted',
  })
  quantity!: number;
}

export class DashboardContributionDto {
  @ApiProperty({
    example: 'sup-5566',
    description: 'Support contribution ID',
  })
  id!: string;

  @ApiProperty({
    type: DashboardContributionSupporterDto,
    description: 'Supporter details',
  })
  supporter!: DashboardContributionSupporterDto;

  @ApiPropertyOptional({
    type: DashboardContributionMaterialDto,
    description: 'Material / fabric gifted',
    nullable: true,
  })
  material?: DashboardContributionMaterialDto | null;

  @ApiPropertyOptional({
    example: 'Your illustrations always brighten my day. Keep creating!',
    description: 'Message or note attached by supporter',
    nullable: true,
  })
  message?: string | null;

  @ApiProperty({
    example: 5000,
    description:
      'Gross contribution amount before charges in naira (e.g. 5000 = ₦5,000)',
  })
  amount!: number;

  @ApiProperty({
    example: 250,
    description: 'Platform fee deducted from the amount, in naira',
  })
  platformFee!: number;

  @ApiProperty({
    example: 4750,
    description: 'Net amount credited to creator in naira (e.g. 4750 = ₦4,750)',
  })
  creatorAmount!: number;

  @ApiProperty({
    example: 'NGN',
    description: 'ISO currency code',
  })
  currency!: string;

  @ApiProperty({
    example: 'PAID',
    description:
      'Payment status. Only received (PAID / COMPLETED) gifts are listed.',
  })
  status!: string;

  @ApiProperty({
    example: 'T123456789',
    nullable: true,
    type: String,
    description: 'Payment reference shown under "Payment details"',
  })
  reference!: string | null;

  @ApiProperty({
    example: '2026-10-06T10:42:00.000Z',
    description: 'Date and time contribution was received',
  })
  createdAt!: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Earnings Over Time Chart Data
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardEarningsPointDto {
  @ApiProperty({
    example: '2026-10-01',
    description: 'ISO date string or bucket identifier',
  })
  date!: string;

  @ApiProperty({
    example: 'Oct 1',
    description: 'Human-friendly formatted label for chart X-axis',
  })
  label!: string;

  @ApiProperty({
    example: 20000,
    description: 'Gross contribution amount in naira in this bucket',
  })
  grossAmount!: number;

  @ApiProperty({
    example: 19000,
    description: 'Net creator earnings in naira in this bucket',
  })
  netAmount!: number;

  @ApiProperty({
    example: 3,
    description: 'Number of contributions received in this bucket',
  })
  contributionsCount!: number;
}

export class DashboardEarningsChartDto {
  @ApiProperty({
    example: '30d',
    description: 'Selected time period (7d, 30d, 90d, 12m, all)',
  })
  period!: string;

  @ApiProperty({
    example: 120000,
    description: 'Total gross earnings within this period in naira',
  })
  totalGross!: number;

  @ApiProperty({
    example: 6000,
    description: 'Total platform fees deducted within this period in naira',
  })
  totalFees!: number;

  @ApiProperty({
    example: 114000,
    description: 'Total net earnings within this period in naira',
  })
  totalNet!: number;

  @ApiProperty({
    example: 'NGN',
    description: 'ISO currency code',
  })
  currency!: string;

  @ApiProperty({
    type: [DashboardEarningsPointDto],
    description: 'Ordered sequence of data points for timeline bar/line chart',
  })
  dataPoints!: DashboardEarningsPointDto[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Complete Dashboard Overview Response
// ─────────────────────────────────────────────────────────────────────────────

export class CreatorDashboardResponseDto {
  @ApiProperty({
    type: DashboardCreatorContextDto,
    description: 'Creator identity and page status',
  })
  creator!: DashboardCreatorContextDto;

  @ApiProperty({
    type: DashboardMetricsDto,
    description: 'Summary contribution metrics (top KPI cards)',
  })
  metrics!: DashboardMetricsDto;

  @ApiProperty({
    type: DashboardBalanceDto,
    description: 'Balance overview and withdrawal eligibility',
  })
  balance!: DashboardBalanceDto;

  @ApiProperty({
    type: [DashboardContributionDto],
    description: 'Recent contributions list',
  })
  recentContributions!: DashboardContributionDto[];

  @ApiProperty({
    type: DashboardEarningsChartDto,
    description: 'Earnings over time chart data',
  })
  earningsChart!: DashboardEarningsChartDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Query DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardEarningsQueryDto {
  @ApiPropertyOptional({
    example: '30d',
    description: 'Time window for chart metrics',
    enum: ['7d', '30d', '90d', '12m', 'all'],
    default: '30d',
  })
  @IsOptional()
  @IsString()
  @IsIn(['7d', '30d', '90d', '12m', 'all'])
  period?: '7d' | '30d' | '90d' | '12m' | 'all' = '30d';
}

export class DashboardContributionsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    example: 'ada',
    description:
      'Matches the supporter name or message, case-insensitive. Anonymous supporters can only be found by their message.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'desc',
    description: 'Date order: newest first (desc) or oldest first (asc)',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}

export class DashboardContributionsListResponseDto {
  @ApiProperty({
    type: [DashboardContributionDto],
    description: 'List of contributions',
  })
  items!: DashboardContributionDto[];

  @ApiProperty({ type: PaginationDto, description: 'Pagination metadata' })
  pagination!: PaginationDto;
}

export class DashboardRecentContributionsQueryDto {
  @ApiPropertyOptional({
    example: 5,
    description:
      'Number of recent contributions to return (default: 5, max: 20)',
    default: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;
}
