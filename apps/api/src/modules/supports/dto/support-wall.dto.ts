import { CursorQueryDto } from '../../../common/dto/page-query.dto';
import { CursorPaginationDto } from '../../../common/dto/pagination.dto';
import { ApiProperty } from '@nestjs/swagger';
import { DashboardContributionMaterialDto } from '../../creators/dto/creator-dashboard.dto';

export class SupportWallQueryDto extends CursorQueryDto {}

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
    type: CursorPaginationDto,
    description:
      'Page size and the cursor for the next page, same block as every other list',
  })
  pagination!: CursorPaginationDto;

  @ApiProperty({
    nullable: true,
    type: String,
    deprecated: true,
    description: 'Use pagination.nextCursor',
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
