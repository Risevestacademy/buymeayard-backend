import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class NotificationPreferencesResponseDto {
  @ApiProperty({
    example: true,
    description: 'Email me when I receive a contribution',
  })
  emailOnContribution!: boolean;

  @ApiProperty({
    example: true,
    description: 'Show an alert in dashboard when I receive a contribution',
  })
  inAppOnContribution!: boolean;

  @ApiProperty({
    example: true,
    description: 'Send mobile push notification for new contributions',
  })
  pushOnContribution!: boolean;

  @ApiProperty({
    example: true,
    description: 'Email alerts for payout status updates (essential)',
  })
  emailOnPayout!: boolean;

  @ApiProperty({
    example: true,
    description: 'In-app alerts for payout status updates (essential)',
  })
  inAppOnPayout!: boolean;

  @ApiProperty({
    example: true,
    description: 'Mobile push for payout status updates',
  })
  pushOnPayout!: boolean;

  @ApiProperty({
    example: true,
    description: 'Email alerts for new sign-in and security events (essential)',
  })
  emailOnSecurityAlert!: boolean;

  @ApiProperty({
    example: true,
    description: 'In-app alerts for security events (essential)',
  })
  inAppOnSecurityAlert!: boolean;

  @ApiProperty({
    example: true,
    description: 'Mobile push for security alerts',
  })
  pushOnSecurityAlert!: boolean;

  @ApiProperty({
    example: false,
    description: 'New platform features and improvements',
  })
  emailOnProductUpdates!: boolean;

  @ApiProperty({
    example: false,
    description: 'Creator tips and ideas for sharing your page',
  })
  emailOnCreatorTips!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailOnContribution?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  inAppOnContribution?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushOnContribution?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushOnPayout?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushOnSecurityAlert?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  emailOnProductUpdates?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  emailOnCreatorTips?: boolean;
}
