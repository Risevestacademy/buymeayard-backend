import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SupportItemDto {
  @ApiProperty({ description: 'ID of the creator material / yard item' })
  @IsString()
  creatorMaterialId!: string;

  @ApiProperty({ description: 'Quantity of yards (must be > 0)', minimum: 1 })
  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class CreateSupportDto {
  @ApiProperty({ description: 'ID of the creator being supported' })
  @IsString()
  creatorId!: string;

  @ApiProperty({
    type: [SupportItemDto],
    description: 'List of yard items purchased',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportItemDto)
  items!: SupportItemDto[];

  @ApiPropertyOptional({ description: 'Optional message from the supporter' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Whether the support is anonymous',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
