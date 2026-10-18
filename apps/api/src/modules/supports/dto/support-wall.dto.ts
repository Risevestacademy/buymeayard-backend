import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SupportWallQueryDto {
  @ApiPropertyOptional({ description: "The previous page's nextCursor, passed back unchanged" })
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
  @ApiProperty({ example: 'Tomi' })
  displayName!: string;

  @ApiProperty({ example: 'Adire', nullable: true, type: String })
  materialName!: string | null;

  @ApiProperty({ example: 'Keep creating!', nullable: true, type: String })
  message!: string | null;

  @ApiProperty()
  createdAt!: Date;
}

export class SupportWallResponseDto {
  @ApiProperty({ type: [SupportWallItemDto] })
  items!: SupportWallItemDto[];

  @ApiProperty({ nullable: true, type: String, description: 'Null when there are no more pages' })
  nextCursor!: string | null;
}