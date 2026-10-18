import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─────────────────────────────────────────────────────────────────────────────
// Social Links
// ─────────────────────────────────────────────────────────────────────────────

export class CreatorSocialLinkResponseDto {
  @ApiProperty({
    example: 'b5f08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'Social link record ID',
  })
  id: string;

  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Creator profile ID this link belongs to',
  })
  creatorId: string;

  @ApiProperty({
    example: 'twitter',
    description:
      'Platform identifier (e.g. twitter, instagram, tiktok, youtube)',
  })
  platform: string;

  @ApiProperty({
    example: 'https://x.com/adeola',
    description: 'Full social profile URL',
  })
  url: string;

  @ApiProperty({ example: '2026-09-25T14:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-25T14:00:00.000Z' })
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Material (nested inside CreatorMaterialResponseDto.material)
// ─────────────────────────────────────────────────────────────────────────────

export class PlatformMaterialDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Platform material catalogue ID',
  })
  id: string;

  @ApiProperty({ example: 'Ankara', description: 'Material display name' })
  name: string;

  @ApiProperty({
    example: 'ankara',
    description: 'URL-safe material slug identifier',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'African wax print fabric widely used in fashion and crafts',
    description: 'Material description',
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.buymeayard.com/materials/ankara.png',
    description: 'Legacy / fallback image URL',
    nullable: true,
  })
  iconUrl?: string | null;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/ankara-sm',
    description: 'Small thumbnail URL for card/grid selectors (≈ 80×80)',
    nullable: true,
  })
  thumbnailSmallUrl?: string | null;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/ankara-lg',
    description: 'Large preview thumbnail URL for material detail (≈ 400×400)',
    nullable: true,
  })
  thumbnailLargeUrl?: string | null;

  @ApiPropertyOptional({
    example: '#7F3516',
    description: 'Hexadecimal theme swatch color code',
    nullable: true,
  })
  color?: string | null;

  @ApiProperty({
    example: 500000,
    description:
      'Default baseline price per yard in kobo (minor units). 500000 = ₦5,000',
  })
  basePrice: number;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Platform material status',
    enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
  })
  status: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Creator Material  (items inside the creator's materials[] array)
// ─────────────────────────────────────────────────────────────────────────────

export class CreatorMaterialResponseDto {
  @ApiProperty({
    example: 'cm-9a8b7c6d-5e4f-3210-fedc-ba9876543210',
    description: 'Creator-material join record ID',
  })
  id: string;

  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Creator profile ID',
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
      'Creator-set price per yard in kobo (minor units). 500000 = ₦5,000',
  })
  price: number;

  @ApiProperty({
    example: 'NGN',
    description: 'ISO 4217 currency code',
  })
  currency: string;

  @ApiPropertyOptional({
    example: 'Premium Ankara',
    description: 'Optional custom display name set by creator',
    nullable: true,
  })
  displayName?: string | null;

  @ApiProperty({
    example: 'Ankara',
    description:
      'Resolved material name (displayName falling back to catalogue name)',
  })
  name: string;

  @ApiProperty({
    example: 'ankara',
    description: 'Material slug handle',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'Classic African wax print, great for bold outfits.',
    description: 'Material description (creator override or catalogue default)',
    nullable: true,
  })
  description?: string | null;

  @ApiPropertyOptional({
    example: '#7F3516',
    description: 'Hexadecimal color swatch for this material',
    nullable: true,
  })
  color?: string | null;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/ankara-sm',
    description: 'Small thumbnail URL for card/grid display (≈ 80×80)',
    nullable: true,
  })
  thumbnailSmallUrl?: string | null;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/ankara-lg',
    description: 'Large preview thumbnail URL for detail views (≈ 400×400)',
    nullable: true,
  })
  thumbnailLargeUrl?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.buymeayard.com/materials/ankara.png',
    description: 'Legacy / fallback image URL',
    nullable: true,
  })
  imageUrl?: string | null;

  @ApiProperty({
    example: false,
    description:
      'true if this is a creator-created custom material; false if it is a platform material',
  })
  isCustom: boolean;

  @ApiProperty({
    example: 'ACTIVE',
    description: 'Status of this material in the creator yard menu',
    enum: ['ACTIVE', 'INACTIVE'],
  })
  status: string;

  @ApiPropertyOptional({
    type: PlatformMaterialDto,
    description:
      'Full platform catalogue material details (only present when the material originates from the platform catalogue)',
    nullable: true,
  })
  material?: PlatformMaterialDto | null;

  @ApiProperty({ example: '2026-09-25T14:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-25T14:00:00.000Z' })
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// User object (embedded inside creator profile)
// ─────────────────────────────────────────────────────────────────────────────

export class EmbeddedUserDto {
  @ApiProperty({
    example: 'u1e08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'User account ID',
  })
  id: string;

  @ApiPropertyOptional({
    example: 'Adeola Johnson',
    description: 'User display name',
    nullable: true,
  })
  name?: string | null;

  @ApiProperty({
    example: 'adeola@example.com',
    description: 'User email address',
  })
  email: string;

  @ApiPropertyOptional({
    example: 'https://lh3.googleusercontent.com/photo.jpg',
    description: 'OAuth profile image URL (from Google/social sign-in)',
    nullable: true,
  })
  image?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Creator Profile  (returned by every creator endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export class CreatorProfileDataDto {
  @ApiProperty({
    example: 'c1d09ec2-67a4-4f9e-a89c-3e6f9a0d81b4',
    description: 'Unique creator profile ID',
  })
  id: string;

  @ApiProperty({
    example: 'u1e08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'Owning user account ID',
  })
  userId: string;

  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator display name',
  })
  creatorName: string;

  @ApiProperty({
    example: 'adeola',
    description: 'Unique creator page slug handle (e.g. buymeayard.com/adeola)',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'Fashion designer in Lagos. I create bold, authentic pieces.',
    description: 'Short creator bio (max 160 characters)',
    nullable: true,
  })
  bio?: string | null;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/v1727627400/avatars/creator-123.jpg',
    description: 'Creator avatar image URL',
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'ID of the selected platform material used as the page appearance theme. Set via PATCH /me/settings.',
    nullable: true,
  })
  themeMaterialId?: string | null;

  @ApiPropertyOptional({
    example: 'Thank you so much for sending me a yard! 🙏 It means everything.',
    description:
      'Personalized thank-you message shown after payment and included in the receipt email. Set via PATCH /me/settings.',
    nullable: true,
  })
  thankYouMessage?: string | null;

  @ApiProperty({
    example: true,
    description:
      'Whether the supporter count and public contributions are displayed on the creator page. Toggled via PATCH /me/settings.',
  })
  showSupportersOnPage: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether the creator support page is publicly live. Set via PATCH /me/page-status. Requires creatorName, slug, bio, avatarUrl, thankYouMessage, and at least one active material.',
  })
  isPublished: boolean;

  @ApiProperty({
    example: false,
    description:
      'Whether the creator has successfully completed identity verification (KYC) and is approved.',
  })
  isKycCompleted: boolean;

  @ApiProperty({
    example: 'PROFILE_CREATED',
    description: 'Creator account lifecycle status',
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
    description: 'KYC verification status',
    enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_REVIEW'],
  })
  kycStatus: string;

  @ApiPropertyOptional({
    example: 'Identity document unreadable or mismatched',
    description:
      'Reason why KYC verification was blocked or rejected by an administrator',
    nullable: true,
  })
  kycBlockedReason?: string | null;

  @ApiPropertyOptional({
    type: EmbeddedUserDto,
    description: 'Embedded user account details',
    nullable: true,
  })
  user?: EmbeddedUserDto | null;

  @ApiProperty({
    type: [CreatorSocialLinkResponseDto],
    description: 'Connected social media links',
  })
  socialLinks: CreatorSocialLinkResponseDto[];

  @ApiPropertyOptional({
    type: CreatorMaterialResponseDto,
    description:
      'The selected yard material / fabric theme for the creator profile page',
    nullable: true,
  })
  material?: CreatorMaterialResponseDto | null;

  @ApiProperty({
    type: [CreatorMaterialResponseDto],
    description:
      'Active yard materials configured by the creator with custom pricing',
  })
  materials: CreatorMaterialResponseDto[];

  @ApiPropertyOptional({
    type: [CreatorMaterialResponseDto],
    description:
      'The list of selected yard materials configured by the creator',
  })
  selectedMaterials?: CreatorMaterialResponseDto[];

  @ApiProperty({ example: '2026-09-25T14:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-25T14:00:00.000Z' })
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response wrappers  (the actual HTTP response shapes)
// NOTE: All creator endpoints return the profile object directly (no data/meta
//       envelope). The @ApiResponse type decorators use CreatorProfileDataDto.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single-creator response — used by all creator mutation and fetch endpoints.
 * The API returns the CreatorProfileDataDto object directly (no wrapper).
 */
export class CreatorResponseDto extends CreatorProfileDataDto {}

/**
 * List response — used by GET /creators (discover page).
 * The API returns an array of CreatorProfileDataDto directly.
 */
export class CreatorListResponseDto extends CreatorProfileDataDto {}

// ─────────────────────────────────────────────────────────────────────────────
// Avatar upload response
// ─────────────────────────────────────────────────────────────────────────────

export class AvatarUploadResponseDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/v1727627400/avatars/creator-123.jpg',
    description: 'CDN URL of the newly uploaded creator avatar',
  })
  avatarUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error response
// ─────────────────────────────────────────────────────────────────────────────

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400, description: 'HTTP status code' })
  statusCode: number;

  @ApiProperty({
    example: 'Creator name is required',
    description: 'Human-readable error message',
  })
  message: string;

  @ApiProperty({ example: 'Bad Request', description: 'HTTP error title' })
  error: string;
}
