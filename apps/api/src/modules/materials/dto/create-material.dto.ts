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
}
