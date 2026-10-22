import { ApiProperty } from '@nestjs/swagger';

export class UserMeCreatorProfileDto {
  @ApiProperty({ example: 'c7b1e0d2-…' })
  id!: string;

  @ApiProperty({ example: 'ayoloco', description: 'Public page slug' })
  slug!: string;

  @ApiProperty({ example: 'Ayo Loco' })
  creatorName!: string;

  @ApiProperty({
    example: 'ACTIVE',
    description:
      'Creator lifecycle: REGISTERED, PROFILE_CREATED, KYC_PENDING, VERIFIED, ACTIVE, SUSPENDED, BANNED, DEACTIVATED',
  })
  status!: string;

  @ApiProperty({
    example: 'VERIFIED',
    description:
      'Identity verification: NOT_SUBMITTED, PENDING, VERIFIED, REJECTED, NEEDS_REVIEW, EXPIRED',
  })
  kycStatus!: string;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Why an admin blocked verification, if they did',
  })
  kycBlockedReason!: string | null;
}

export class UserMeResponseDto {
  @ApiProperty({ example: 'u_123' })
  id!: string;

  @ApiProperty({ example: 'ayo@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ayo Loco', nullable: true })
  name!: string | null;

  @ApiProperty({ example: 'https://…/avatar.jpg', nullable: true })
  image!: string | null;

  @ApiProperty({ example: true })
  emailVerified!: boolean;

  @ApiProperty({ example: 'ACTIVE', description: 'User account status' })
  status!: string;

  @ApiProperty({ example: ['CREATOR'], type: [String] })
  roles!: string[];

  @ApiProperty({
    example: true,
    description: 'The creator finished onboarding',
  })
  isOnboardingCompleted!: boolean;

  @ApiProperty({
    example: true,
    description: 'Same as isOnboardingCompleted',
  })
  isProfileSetupCompleted!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Identity verification approved. Setup step 1 on the Payouts page. false for non-creators.',
  })
  isKycCompleted!: boolean;

  @ApiProperty({
    example: true,
    description:
      'A verified payout bank account is saved. Setup step 2 on the Payouts page. false for non-creators.',
  })
  isBankAccountConnected!: boolean;

  @ApiProperty({ type: UserMeCreatorProfileDto, nullable: true })
  creatorProfile!: UserMeCreatorProfileDto | null;

  @ApiProperty({ example: '2026-09-01T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-10-17T10:00:00.000Z' })
  updatedAt!: Date;
}
