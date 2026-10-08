import { ApiProperty } from '@nestjs/swagger';

export class SessionItemDto {
  @ApiProperty({ example: 'sess_123' })
  id!: string;

  @ApiProperty({
    example: 'DESKTOP',
    enum: ['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN'],
  })
  deviceType!: string;

  @ApiProperty({ example: 'Chrome' })
  browser!: string;

  @ApiProperty({ example: 'macOS' })
  os!: string;

  @ApiProperty({ example: 'Chrome on macOS' })
  deviceLabel!: string;

  @ApiProperty({ example: '102.89.23.4', nullable: true })
  ipAddress!: string | null;

  @ApiProperty({ example: 'Lagos, Nigeria' })
  location!: string;

  @ApiProperty({
    example: true,
    description: 'True if this is the active session making the current request',
  })
  isCurrent!: boolean;

  @ApiProperty({ example: '2026-10-08T20:50:00.000Z' })
  lastActiveAt!: Date;

  @ApiProperty({ example: '2026-10-01T08:00:00.000Z' })
  createdAt!: Date;
}

export class SessionsListResponseDto {
  @ApiProperty({ type: () => [SessionItemDto] })
  sessions!: SessionItemDto[];
}

export class RevokeSessionsResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: 2 })
  revokedCount!: number;

  @ApiProperty({
    example: 'All other devices have been signed out successfully.',
  })
  message!: string;
}
