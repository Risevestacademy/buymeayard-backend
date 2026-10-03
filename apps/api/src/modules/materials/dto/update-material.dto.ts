import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateMaterialDto {
  @ApiPropertyOptional({
    example: 'Velvet Lace Deluxe',
    description: 'Updated name of the material',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: 'velvet-lace-deluxe',
    description: 'Updated unique URL-friendly slug',
  })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    example: 'Updated description for this material',
    description: 'Updated description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/sample2.jpg',
    description: 'Updated image URL representing the fabric',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill/materials/ankara-sm',
    description: 'Updated small thumbnail URL for fabric cards/grids',
  })
  @IsOptional()
  @IsString()
  thumbnailSmallUrl?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill/materials/ankara-lg',
    description: 'Updated large thumbnail URL for detail preview',
  })
  @IsOptional()
  @IsString()
  thumbnailLargeUrl?: string;

  @ApiPropertyOptional({
    example: '#7F3516',
    description: 'Updated hexadecimal color representation for UI theme/swatch',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE'],
    description: 'Availability status of the material',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: string;
}

