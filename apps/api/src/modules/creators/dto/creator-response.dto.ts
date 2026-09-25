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
    example: 'adeola',
    description: 'Unique username / slug for creator routing',
  })
  username: string;

  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator display name',
  })
  displayName: string;

  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator name',
  })
  name: string;

  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator name alias',
  })
  creatorName: string;

  @ApiProperty({
    example: 'buymeayard/adeola',
    description: 'Personalized public link',
  })
  personalizedLink: string;

  @ApiPropertyOptional({
    example: 'Adeola',
    description: 'First name derived from creator name',
    nullable: true,
  })
  firstName?: string | null;

  @ApiPropertyOptional({
    example: 'Johnson',
    description: 'Last name derived from creator name',
    nullable: true,
  })
  lastName?: string | null;

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
