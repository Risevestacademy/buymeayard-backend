import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBasePriceDto {
  @ApiProperty({
    example: 1000,
    description:
      'Universal platform base price per yard in major units (NGN, e.g. 1000 for ₦1,000) or minor units (100,000 kobo)',
  })
  @IsNumber()
  @Min(1)
  price: number;

  @ApiPropertyOptional({
    example: 'NGN',
    description: 'Currency code',
    default: 'NGN',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'If true, synchronizes all existing creator materials to also use this new base price',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  updateCreatorMaterials?: boolean;
}
