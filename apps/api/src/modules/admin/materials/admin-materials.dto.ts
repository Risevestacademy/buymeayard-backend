import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminListQueryDto } from '../dto/admin-query.dto';

export class AdminMaterialsQueryDto extends AdminListQueryDto {
  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({
    enum: ['PLATFORM', 'CREATOR'],
    description: 'PLATFORM = catalogue materials, CREATOR = creator-made',
  })
  @IsOptional()
  @IsIn(['PLATFORM', 'CREATOR'])
  source?: 'PLATFORM' | 'CREATOR';

  @ApiPropertyOptional({
    enum: ['recently_updated', 'newest', 'oldest', 'name'],
    default: 'recently_updated',
  })
  @IsOptional()
  @IsIn(['recently_updated', 'newest', 'oldest', 'name'])
  sort?: 'recently_updated' | 'newest' | 'oldest' | 'name';
}

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class AdminCreateMaterialDto {
  @ApiProperty({ example: 'Velvet Lace' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: 'Auto-generated from name if omitted' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description:
      'Small thumbnail URL. Upload the image with POST /admin/materials/thumbnail and send the returned url',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  thumbnailSmallUrl?: string;

  @ApiPropertyOptional({
    description:
      'Large thumbnail URL. Upload the image with POST /admin/materials/thumbnail and send the returned url',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  thumbnailLargeUrl?: string;

  @ApiPropertyOptional({ example: '#7F3516' })
  @IsOptional()
  @Matches(HEX_COLOR, { message: 'color must be a hex code like #7F3516' })
  color?: string;

  @ApiPropertyOptional({
    description: 'Price per yard in naira. Defaults to the platform base price',
    example: 1000,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  defaultPrice?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({
    description:
      'Creator profile id. Omit for a platform material; set to create a creator-owned one',
  })
  @IsOptional()
  @IsUUID()
  creatorId?: string;
}

/** Every create field is optional on update, except creatorId (owner is fixed). */
export class AdminUpdateMaterialDto extends PartialType(
  OmitType(AdminCreateMaterialDto, ['creatorId'] as const),
) {}

export class ThumbnailUploadResponseDto {
  @ApiProperty({
    example:
      'https://res.cloudinary.com/buymeayard/image/upload/v1727627400/materials/abc123.jpg',
    description:
      'CDN URL of the uploaded image. Send it as thumbnailSmallUrl or thumbnailLargeUrl when creating or editing a material',
  })
  url: string;
}
