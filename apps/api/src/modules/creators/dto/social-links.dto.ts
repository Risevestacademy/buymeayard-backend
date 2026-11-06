import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SOCIAL_PLATFORMS } from '../social-links.util';

export class SocialLinkInputDto {
  @ApiProperty({
    enum: SOCIAL_PLATFORMS,
    example: 'instagram',
    description: '`twitter` is accepted as an alias for `x`',
  })
  @IsString()
  @IsNotEmpty()
  platform!: string;

  @ApiProperty({
    example: '@adeola',
    description:
      'A handle or the profile URL. Stored as the canonical https URL. Discord takes an invite link only.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  url!: string;
}

export class SaveSocialLinksDto {
  @ApiProperty({
    type: [SocialLinkInputDto],
    description:
      'The full set of links. Anything not listed is removed; an empty list clears them all. One link per platform.',
  })
  @IsArray()
  @ArrayMaxSize(SOCIAL_PLATFORMS.length)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkInputDto)
  links!: SocialLinkInputDto[];
}
