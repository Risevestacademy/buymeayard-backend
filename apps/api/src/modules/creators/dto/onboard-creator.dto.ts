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
    description: 'Creator display name entered during onboarding',
    required: false,
  })
  @IsOptional()
  @IsString()
  creatorName?: string;

  @ApiPropertyOptional({
    example: 'Adeola Johnson',
    description: 'Alternative alias for creator display name',
  })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiProperty({
    example: 'buymeayard/adeola',
    description:
      'Personalized profile link entered by creator (e.g. "buymeayard/adeola" or "adeola")',
    required: false,
  })
  @IsOptional()
  @IsString()
  personalizedLink?: string;

  @ApiPropertyOptional({
    example: 'adeola',
    description: 'Alternative alias for personalized link slug handle',
  })
  @IsOptional()
  @IsString()
  username?: string;

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
