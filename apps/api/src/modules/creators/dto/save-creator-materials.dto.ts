import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatorMaterialItemDto {
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'Platform material ID (from GET /materials)',
  })
  @IsUUID()
  materialId: string;

  @ApiPropertyOptional({
    example: 100000,
    description:
      'Optional price per yard in minor units (kobo). If omitted, inherits the platform universal base price.',
  })
  @IsOptional()
  @IsInt()
  @Min(100)
  price?: number;

  @ApiPropertyOptional({
    example: 'My Ankara',
    description: 'Optional custom display name for this material',
  })
  @IsOptional()
  @IsString()
  displayName?: string;
}

export class SaveCreatorMaterialsDto {
  @ApiProperty({
    type: [CreatorMaterialItemDto],
    description:
      'List of materials the creator wants to offer with custom pricing. Replaces the current material menu.',
    example: [
      { materialId: 'uuid-ankara', price: 500000 },
      { materialId: 'uuid-lace', price: 1000000, displayName: 'Premium Lace' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatorMaterialItemDto)
  materials: CreatorMaterialItemDto[];
}
