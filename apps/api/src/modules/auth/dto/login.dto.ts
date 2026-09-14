import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'creator@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!', description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
