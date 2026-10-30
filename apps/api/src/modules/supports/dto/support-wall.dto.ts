import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DashboardContributionMaterialDto } from '../../creators/dto/creator-dashboard.dto';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SupportWallQueryDto {
  @ApiPropertyOptional({
    description: "The previous page's nextCursor, passed back unchanged",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number) // query params arrive as strings
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SupportWallItemDto {
  @ApiProperty({
    description: 'The gift id. Use it as the list key.',
  })
  id!: string;

  @ApiProperty({ example: 'Tomi' })
  displayName!: string;

  @ApiProperty({
    type: DashboardContributionMaterialDto,
    nullable: true,
    description:
      'The fabric gifted, same shape as on the creator dashboard: id, name, color, thumbnailUrl and yards (quantity).',
  })
  material!: DashboardContributionMaterialDto | null;

  @ApiProperty({
    nullable: true,
    type: String,
    deprecated: true,
    description: 'Use material.id',
  })
  materialId!: string | null;

  @ApiProperty({
    example: 'Adire',
    nullable: true,
    type: String,
    deprecated: true,
    description: 'Use material.name',
  })
  materialName!: string | null;

  @ApiProperty({ example: 'Keep creating!', nullable: true, type: String })
  message!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class SupportWallResponseDto {
  @ApiProperty({ type: [SupportWallItemDto] })
  items!: SupportWallItemDto[];

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Null when there are no more pages',
  })
  nextCursor!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 128,
    description:
      'Total paid gifts received, for the "128 Supporters" header. Null when the creator turned the wall off.',
  })
  supporterCount!: number | null;
}
