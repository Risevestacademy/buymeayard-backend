import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateCustomMaterialDto {
  @ApiProperty({
    example: 'Silk Georgette',
    description: 'Name of the creator custom material / appearance',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Exclusive custom silk fabric for my supporters',
    description: 'Optional short description of the custom material',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: '#C2185B',
    description:
      'Hexadecimal color swatch for this material (e.g. #C2185B). Used for UI theme display.',
  })
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/silk-sm.jpg',
    description:
      'Small thumbnail image URL for card/grid selectors (approx 80×80).',
  })
  @IsOptional()
  @IsUrl()
  thumbnailSmallUrl?: string;

  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/silk-lg.jpg',
    description:
      'Large preview image URL for material detail views (approx 400×400).',
  })
  @IsOptional()
  @IsUrl()
  thumbnailLargeUrl?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/custom-silk.jpg',
    description: 'Legacy / fallback image URL for the custom material.',
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
