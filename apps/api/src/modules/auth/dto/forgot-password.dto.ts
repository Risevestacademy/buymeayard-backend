import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email address to send password reset link to',
  })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    example: 'mobile',
    description:
      'Optional client identifier (e.g. "mobile"). When set to "mobile", the password reset email link includes ?from=mobile for web-to-app deep linking.',
  })
  @IsOptional()
  @IsString()
  from?: string;
}
