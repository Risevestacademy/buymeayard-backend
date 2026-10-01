import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMaterialDto {
  @ApiProperty({
    example: 'Velvet Lace',
    description: 'Name of the material/fabric',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'velvet-lace',
    description: 'Unique URL-friendly slug. Auto-generated from name if omitted.',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    example: 'Rich and luxurious heavy textured fabric',
    description: 'Detailed description of the material',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    description: 'Image URL representing the fabric swatch',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/ankara-sm',
    description: 'Small thumbnail URL for fabric cards/grids',
  })
  @IsOptional()
  @IsString()
  thumbnailSmallUrl?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/ankara-lg',
    description: 'Large thumbnail URL for detail preview',
  })
  @IsOptional()
  @IsString()
  thumbnailLargeUrl?: string;

  @ApiPropertyOptional({
    example: '#7F3516',
    description: 'Hexadecimal color representation for UI theme/swatch',
  })
  @IsOptional()
  @IsString()
  color?: string;
}

