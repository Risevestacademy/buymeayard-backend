import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterCreatorDto {
  @ApiProperty({
    example: 'creator@example.com',
    description: 'Creator email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongP@ssw0rd!',
    description: 'Password (minimum 8 characters)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator full display name',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'adeola_creates',
    description: 'Unique username for the creator profile (no spaces)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message:
      'Username can only contain letters, numbers, underscores, and dots',
  })
  username!: string;

  @ApiPropertyOptional({
    example: 'Fashion designer based in Lagos',
    description: 'Creator bio',
  })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({
    example: 'uuid-category-id',
    description: 'ID of the creator category (e.g., Fashion, Tech)',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;
}
