import { ApiProperty } from '@nestjs/swagger';

export class AccountKycCardDto {
  @ApiProperty({
    example: 'VERIFIED',
    enum: ['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'NEEDS_ATTENTION'],
  })
  state!: 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'NEEDS_ATTENTION';

  @ApiProperty({ example: 'Verified' })
  badgeLabel!: string;

  @ApiProperty({
    example: 'success',
    enum: ['neutral', 'warning', 'success', 'danger'],
  })
  badgeVariant!: 'neutral' | 'warning' | 'success' | 'danger';

  @ApiProperty({ example: 'Identity verified' })
  title!: string;

  @ApiProperty({
    example:
      "You're verified and can withdraw your earnings. Verified on Oct 8, 2026.",
  })
  description!: string;

  @ApiProperty({ example: null, nullable: true })
  ctaLabel!: string | null;

  @ApiProperty({
    example: null,
    nullable: true,
    enum: ['START_KYC', 'RETRY_KYC', null],
  })
  ctaAction!: 'START_KYC' | 'RETRY_KYC' | null;
}

export class SettingsAccountUserDto {
  @ApiProperty({ example: 'usr_123' })
  id!: string;

  @ApiProperty({ example: 'David Olaleye' })
  legalName!: string;

  @ApiProperty({
    example: true,
    description: 'True if identity is verified via KYC',
  })
  isLegalNameVerified!: boolean;

  @ApiProperty({ example: 'david@example.com' })
  email!: string;

  @ApiProperty({ example: true })
  isEmailVerified!: boolean;

  @ApiProperty({
    example: 'https://cdn.buymeayard.com/avatar.jpg',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;
}

export class SettingsAccountCreatorDto {
  @ApiProperty({ example: 'crt_123' })
  id!: string;

  @ApiProperty({ example: 'davidyard' })
  slug!: string;

  @ApiProperty({ example: 'buymeayard.com/davidyard' })
  vanityUrl!: string;

  @ApiProperty({ example: true })
  isPublished!: boolean;

  @ApiProperty({ example: 'VERIFIED' })
  kycStatus!: string;

  @ApiProperty({ example: '2026-10-08T12:00:00.000Z', nullable: true })
  kycVerifiedAt!: Date | null;

  @ApiProperty({ example: null, nullable: true })
  kycBlockedReason!: string | null;

  @ApiProperty({ type: () => AccountKycCardDto })
  kycCard!: AccountKycCardDto;
}

export class SettingsAccountResponseDto {
  @ApiProperty({ type: () => SettingsAccountUserDto })
  user!: SettingsAccountUserDto;

  @ApiProperty({ type: () => SettingsAccountCreatorDto, nullable: true })
  creator!: SettingsAccountCreatorDto | null;
}
