import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatorSocialLinkResponseDto {
  @ApiProperty({
    example: 'b5f08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'Social link ID',
  })
  id: string;

  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Creator ID',
  })
  creatorId: string;

  @ApiProperty({
    example: 'twitter',
    description: 'Platform name (e.g. twitter, instagram, tiktok, youtube)',
  })
  platform: string;

  @ApiProperty({
    example: 'https://x.com/adeola',
    description: 'Social profile URL',
  })
  url: string;

  @ApiProperty({
    example: '2026-09-25T14:00:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-25T14:00:00.000Z',
    description: 'Last update timestamp',
  })
  updatedAt: Date;
}

export class PlatformMaterialDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Platform material ID',
  })
  id: string;

  @ApiProperty({
    example: 'ankara',
    description: 'Material slug handle',
  })
  slug: string;

  @ApiProperty({
    example: 'Ankara',
    description: 'Material display name',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'African wax print fabric widely used in fashion and crafts',
    description: 'Material description',
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.buymeayard.com/materials/ankara.png',
    description: 'Material image or icon URL',
    nullable: true,
  })
  iconUrl?: string | null;

  @ApiProperty({
    example: 500000,
    description:
      'Default baseline price per yard in kobo (minor currency unit). 500000 = ₦5,000',
  })
  basePrice: number;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/ankara-sm',
    description: 'Small thumbnail image URL for card/grid display (approx 80x80)',
    nullable: true,
  })
  thumbnailSmallUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/ankara-lg',
    description: 'Large preview thumbnail URL for material detail views (approx 400x400)',
    nullable: true,
  })
  thumbnailLargeUrl?: string | null;

  @ApiPropertyOptional({
    example: '#7F3516',
    description: 'Hexadecimal color code for theme swatch (e.g. #7F3516)',
    nullable: true,
  })
  color?: string | null;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Platform material status',
    enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
  })
  status: string;
}

export class CreatorMaterialResponseDto {
  @ApiProperty({
    example: 'cm-9a8b7c6d-5e4f-3210-fedc-ba9876543210',
    description: 'Creator material configuration ID',
  })
  id: string;

  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Associated creator profile ID',
  })
  creatorId: string;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Platform material catalogue ID',
  })
  materialId: string;

  @ApiProperty({
    example: 500000,
    description:
      'Custom price per yard set by creator in kobo (minor units). 500000 = ₦5,000',
  })
  price: number;

  @ApiPropertyOptional({
    example: 'Premium Ankara',
    description: 'Optional custom display title chosen by creator',
    nullable: true,
  })
  displayName?: string | null;

  @ApiPropertyOptional({
    example: 'Ankara',
    description: 'Material name',
  })
  name?: string;

  @ApiPropertyOptional({
    example: 'ankara',
    description: 'Material slug handle',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: '#7F3516',
    description: 'Hexadecimal color representation (e.g. #7F3516)',
    nullable: true,
  })
  color?: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/ankara-sm',
    description: 'Small thumbnail image URL for card/grid display (approx 80x80)',
    nullable: true,
  })
  thumbnailSmallUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/ankara-lg',
    description: 'Large preview thumbnail URL for material detail views (approx 400x400)',
    nullable: true,
  })
  thumbnailLargeUrl?: string | null;

  @ApiPropertyOptional({
    example: false,
    description: 'Whether this is a creator custom material',
  })
  isCustom?: boolean;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Status of this material in creator menu',
    enum: ['ACTIVE', 'INACTIVE'],
  })
  status: string;

  @ApiPropertyOptional({
    type: PlatformMaterialDto,
    description: 'Underlying platform catalogue material details',
  })
  material?: PlatformMaterialDto;

  @ApiProperty({
    example: '2026-09-25T14:00:00.000Z',
    description: 'Creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-25T14:00:00.000Z',
    description: 'Last update timestamp',
  })
  updatedAt: Date;
}

export class AvatarUploadResponseDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/v1727627400/avatars/creator-123.jpg',
    description: 'Direct CDN URL of uploaded creator avatar',
  })
  avatarUrl: string;
}

export class CreatorProfileDataDto {
  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Unique creator profile ID',
  })
  id: string;

  @ApiProperty({
    example: 'u1e08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'Associated user ID',
  })
  userId: string;

  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator name',
  })
  creatorName: string;

  @ApiProperty({
    example: 'adeola',
    description: 'Unique creator URL slug handle',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'Fashion designer in Lagos',
    description: 'Creator bio',
    nullable: true,
  })
  bio?: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    description: 'Avatar image URL',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    example: 'Thank you so much for your support! 🙏 I appreciate every yard.',
    description: 'Personalized thank-you message shown after payment and in receipt email.',
    nullable: true,
  })
  thankYouMessage?: string | null;

  @ApiProperty({
    example: true,
    description:
      'Whether to display supporter count and public contributions on the creator page',
  })
  showSupportersOnPage: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether the creator support page is publicly visible',
  })
  isPublished: boolean;

  @ApiProperty({
    example: 'PROFILE_CREATED',
    description: 'Creator account status',
    enum: [
      'REGISTERED',
      'PROFILE_CREATED',
      'KYC_PENDING',
      'VERIFIED',
      'ACTIVE',
      'SUSPENDED',
      'BANNED',
      'DEACTIVATED',
    ],
  })
  status: string;

  @ApiProperty({
    example: 'NOT_SUBMITTED',
    description: 'KYC status',
    enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_REVIEW'],
  })
  kycStatus: string;

  @ApiProperty({
    type: [CreatorSocialLinkResponseDto],
    description: 'List of connected social links',
  })
  socialLinks: CreatorSocialLinkResponseDto[];

  @ApiPropertyOptional({
    type: [CreatorMaterialResponseDto],
    description:
      'List of active yard materials with custom pricing configured by creator',
  })
  materials?: CreatorMaterialResponseDto[];

  @ApiProperty({
    example: '2026-09-25T14:00:00.000Z',
    description: 'Created timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-25T14:00:00.000Z',
    description: 'Last update timestamp',
  })
  updatedAt: Date;
}

export class CreatorResponseDto {
  @ApiProperty({
    type: CreatorProfileDataDto,
    description: 'Creator profile data',
  })
  data: CreatorProfileDataDto;

  @ApiProperty({
    example: {},
    description: 'Response metadata',
  })
  meta: Record<string, any>;
}

export class CreatorListResponseDto {
  @ApiProperty({
    type: [CreatorProfileDataDto],
    description: 'Array of creator profiles',
  })
  data: CreatorProfileDataDto[];

  @ApiProperty({
    example: {},
    description: 'Response metadata',
  })
  meta: Record<string, any>;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Creator name is required',
    description: 'Detailed error message',
  })
  message: string;

  @ApiProperty({ example: 'Bad Request', description: 'Error title' })
  error: string;
}
