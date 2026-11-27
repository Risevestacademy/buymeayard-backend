import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsValidPassword } from '../../../common';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token from the email link',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({
    example: 'NewStrongP@ss1!',
    description:
      'New password (minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character)',
  })
  @IsValidPassword()
  newPassword!: string;
}
