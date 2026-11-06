import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialLinkDto {
  @ApiProperty({
    example: 'twitter',
    description:
      'youtube, twitch, x, facebook, instagram, tiktok or discord (`twitter` is accepted as x)',
  })
  @IsString()
  platform: string;

  @ApiProperty({
    example: 'https://x.com/adeola',
    description:
      'Handle (@adeola) or profile URL. Stored as a canonical https URL. Discord needs an invite link.',
  })
  @IsString()
  url: string;
}

export class OnboardCreatorDto {
  @ApiProperty({
    example: 'Adeola Johnson',
    description: 'Creator name entered during onboarding',
    required: true,
  })
  @IsOptional()
  @IsString()
  creatorName?: string;

  @ApiProperty({
    example: 'adeola',
    description:
      'Unique creator URL slug / handle (e.g. "adeola"). Only the slug is needed as the domain can change.',
    required: true,
  })
  @IsOptional()
  @IsString()
  slug?: string;

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
