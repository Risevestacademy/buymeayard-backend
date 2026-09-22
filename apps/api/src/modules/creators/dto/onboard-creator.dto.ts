import { IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardCreatorDto {
  @ApiPropertyOptional({
    example: 'Adeola Johnson',
    description: 'Creator display name',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    example: 'adeola_creates',
    description: 'Unique username / slug for the creator profile',
  })
  @IsOptional()
  @IsString()
  username?: string;

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

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    description: 'URL to the creator avatar image',
  })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/cover.jpg',
    description: 'URL to the creator cover image',
  })
  @IsOptional()
  @IsUrl()
  coverUrl?: string;
}
