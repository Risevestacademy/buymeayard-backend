import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialLinkDto {
  @ApiProperty({
    example: 'twitter',
    description:
      'Social platform name (e.g., twitter, instagram, tiktok, youtube)',
  })
  @IsString()
  platform: string;

  @ApiProperty({
    example: 'https://x.com/adeola',
    description: 'URL to creator social profile',
  })
  @IsString()
  url: string;
}

export class OnboardCreatorDto {
  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator name entered during onboarding',
    required: false,
  })
  @IsOptional()
  @IsString()
  creatorName?: string;

  @ApiProperty({
    example: 'adeola',
    description:
      'Unique creator URL slug / handle (e.g. "adeola"). Only the slug is needed as the domain can change.',
    required: false,
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    example: 'adeola',
    description: 'Alternative alias for slug',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    example: 'adeola',
    description: 'Legacy alias for slug (e.g. "adeola" or "buymeayard/adeola")',
  })
  @IsOptional()
  @IsString()
  personalizedLink?: string;

  @ApiPropertyOptional({
    example: 'Adeola Johnson',
    description: 'Alternative alias for creator name',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({
    type: [SocialLinkDto],
    description: 'List of connected social media accounts',
    example: [
      { platform: 'twitter', url: 'https://x.com/adeola' },
      { platform: 'instagram', url: 'https://instagram.com/adeola' },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SocialLinkDto)
  socialLinks?: SocialLinkDto[];
}
