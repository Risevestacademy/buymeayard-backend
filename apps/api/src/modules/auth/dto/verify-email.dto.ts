import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token from the verification link',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
