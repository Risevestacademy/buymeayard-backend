import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomMaterialDto {
  @ApiProperty({
    example: 'Silk Georgette',
    description: 'Name of the creator custom material / appearance',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/demo/image/upload/custom-silk.jpg',
    description: 'Image URL representing the custom fabric appearance',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 'Exclusive custom silk fabric for my supporters',
    description: 'Optional description of the custom material',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
