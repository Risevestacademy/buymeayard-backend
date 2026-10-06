import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';

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
    example: 12000000,
    description:
      'Total contribution amount before charges in minor units / kobo (e.g. 12000000 kobo = ₦120,000)',
  })
  totalContributionAmount!: number;

  @ApiProperty({
    example: 11400000,
    description:
      'Total net earnings after platform charges in minor units / kobo (e.g. 11400000 kobo = ₦114,000)',
  })
  netEarnings!: number;

  @ApiProperty({
    example: 600000,
    description:
      'Total platform processing and service fees deducted in minor units / kobo (e.g. 600000 kobo = ₦6,000)',
  })
  platformFees!: number;

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
    example: 7200000,
    description:
      'Available funds in ledger ready for payout in minor units / kobo (e.g. 7200000 kobo = ₦72,000)',
  })
  availableBalance!: number;

  @ApiProperty({
    example: 1200000,
    description:
      'Pending balance / funds in transit / pending payouts in minor units / kobo (e.g. 1200000 kobo = ₦12,000)',
  })
  pendingBalance!: number;

  @ApiProperty({
    example: 3000000,
    description:
      'Total amount successfully withdrawn to bank to date in minor units / kobo (e.g. 3000000 kobo = ₦30,000)',
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
      'Whether creator is currently eligible to withdraw (KYC verified, active, positive balance, and payout method configured)',
  })
  canWithdraw!: boolean;

  @ApiProperty({
    example: 'VERIFIED',
    description: 'Current KYC verification status',
  })
  kycStatus!: string;

  @ApiProperty({
    example: true,
    description: 'Whether creator has configured a default bank payout method',
  })
  hasPayoutMethod!: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Supporter & Material for Contributions
// ─────────────────────────────────────────────────────────────────────────────

export class DashboardContributionSupporterDto {
  @ApiPropertyOptional({
    example: 'u-1234',
    description: 'Supporter user ID, or null if anonymous',
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
    example: 500000,
    description:
      'Gross contribution amount before charges in minor units / kobo (e.g. 500000 kobo = ₦5,000)',
  })
  amount!: number;

  @ApiProperty({
    example: 475000,
    description:
      'Net amount credited to creator in minor units / kobo (e.g. 475000 kobo = ₦4,750)',
  })
  creatorAmount!: number;

  @ApiProperty({
    example: 'NGN',
    description: 'ISO currency code',
  })
  currency!: string;

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
    example: 2000000,
    description:
      'Gross contribution amount in minor units / kobo in this bucket',
  })
  grossAmount!: number;

  @ApiProperty({
    example: 1900000,
    description: 'Net creator earnings in minor units / kobo in this bucket',
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
    example: 12000000,
    description:
      'Total gross earnings within this period in minor units / kobo',
  })
  totalGross!: number;

  @ApiProperty({
    example: 600000,
    description:
      'Total platform fees deducted within this period in minor units / kobo',
  })
  totalFees!: number;

  @ApiProperty({
    example: 11400000,
    description: 'Total net earnings within this period in minor units / kobo',
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

export class DashboardContributionsQueryDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    description: 'Number of items per page',
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}

export class DashboardContributionsPaginationDto {
  @ApiProperty({ example: 24, description: 'Total count of contributions' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 10, description: 'Page size limit' })
  limit!: number;

  @ApiProperty({ example: 3, description: 'Total number of pages' })
  totalPages!: number;
}

export class DashboardContributionsListResponseDto {
  @ApiProperty({
    type: [DashboardContributionDto],
    description: 'List of contributions',
  })
  data!: DashboardContributionDto[];

  @ApiProperty({
    type: DashboardContributionsPaginationDto,
    description: 'Pagination metadata',
  })
  pagination!: DashboardContributionsPaginationDto;
}
