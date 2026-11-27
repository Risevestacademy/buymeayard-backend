import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsValidPassword } from '../../../common';

export class RegisterDto {
  @ApiProperty({
    example: 'creator@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongP@ssw0rd!',
    description:
      'Password (minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character)',
  })
  @IsValidPassword()
  password!: string;
}
