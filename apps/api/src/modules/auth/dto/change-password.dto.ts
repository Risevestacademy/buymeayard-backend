import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidPassword } from '../../../common';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldP@ssw0rd!',
    description: 'Current password',
  })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    example: 'NewStrongP@ss1!',
    description:
      'New password (minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character)',
  })
  @IsValidPassword()
  newPassword!: string;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Sign the user out of all their other sessions (other browsers and devices) when the password changes. The current session stays signed in.',
  })
  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;

  @ApiPropertyOptional({
    example: true,
    deprecated: true,
    description:
      'Same as `revokeOtherSessions`. Accepted so an older frontend does not get a 400; use `revokeOtherSessions`.',
  })
  @IsOptional()
  @IsBoolean()
  revokeOtherSession?: boolean;
}
