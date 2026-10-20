import { ApiProperty } from '@nestjs/swagger';

export class CreatorSupportItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Ada Okafor' })
  displayName!: string;

  @ApiProperty({ example: 'Ankara', nullable: true, type: String })
  materialName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  materialThumbnailUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  message!: string | null;

  @ApiProperty({
    example: 500000,
    description: 'What the supporter paid, in kobo',
  })
  amount!: number;

  @ApiProperty({
    example: 450000,
    description: 'What the creator keeps after the platform fee, in kobo',
  })
  netAmount!: number;

  @ApiProperty()
  createdAt!: Date;
}

export class CreatorSupportListResponseDto {
  @ApiProperty({ type: [CreatorSupportItemDto] })
  items!: CreatorSupportItemDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;
}
