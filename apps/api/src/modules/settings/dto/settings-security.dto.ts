import { ApiProperty } from '@nestjs/swagger';

export class SettingsAuthProviderDto {
  @ApiProperty({ example: 'google', enum: ['credential', 'google', 'apple'] })
  providerId!: string;

  @ApiProperty({ example: 'Google' })
  name!: string;

  @ApiProperty({ example: true })
  connected!: boolean;

  @ApiProperty({ example: 'david@gmail.com', nullable: true })
  email!: string | null;

  @ApiProperty({
    example: true,
    description:
      'True if the user has at least one other active authentication method and can safely disconnect this provider',
  })
  canDisconnect!: boolean;
}

export class SettingsSecurityResponseDto {
  @ApiProperty({ example: true })
  hasPassword!: boolean;

  @ApiProperty({ example: '2026-09-01T14:32:00.000Z', nullable: true })
  passwordLastChangedAt!: Date | null;

  @ApiProperty({ type: () => [SettingsAuthProviderDto] })
  providers!: SettingsAuthProviderDto[];
}
