import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  SUPPORT_VISIBILITIES,
  SupportVisibility,
} from '../../supports/utils/support-visibility.util';

export const MIN_GIFT_AMOUNT_NAIRA = 100;
export const MAX_GIFT_AMOUNT_NAIRA = 10_000_000;

export class CreateSupportIntentDto {
  @ApiProperty({
    example: 2000,
    minimum: MIN_GIFT_AMOUNT_NAIRA,
    maximum: MAX_GIFT_AMOUNT_NAIRA,
    description: 'Amount in Naira (major units) the supporter wishes to gift',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_GIFT_AMOUNT_NAIRA)
  @Max(MAX_GIFT_AMOUNT_NAIRA)
  amount: number;

  @ApiPropertyOptional({
    example: 'Love your work!',
    description: 'Optional message from the supporter to the creator',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({
    example: 'Jane Doe',
    description:
      'Supporter name (optional, guest supporters can provide a name)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'jane@example.com',
    deprecated: true,
    description:
      'Ignored. Bachs collects the supporter email at checkout and sends the receipt there. Still accepted so older clients do not break.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    enum: SUPPORT_VISIBILITIES,
    default: 'PUBLIC',
    description:
      'Who sees the name and message. `PUBLIC`: the contribution wall and the creator dashboard. `CREATOR_ONLY`: hidden on the wall, shown on the creator dashboard. `ANONYMOUS`: hidden on both.',
  })
  @IsOptional()
  @IsIn(SUPPORT_VISIBILITIES, {
    message: 'visibility must be PUBLIC, CREATOR_ONLY or ANONYMOUS',
  })
  visibility?: SupportVisibility;

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Use `visibility`. `true` means `ANONYMOUS` when `visibility` is not sent.',
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}

export class SupportQuoteQueryDto {
  @ApiProperty({
    example: 5000,
    minimum: MIN_GIFT_AMOUNT_NAIRA,
    maximum: MAX_GIFT_AMOUNT_NAIRA,
    description: 'Amount in Naira (major units)',
  })
  @Type(() => Number) // query params arrive as strings
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_GIFT_AMOUNT_NAIRA)
  @Max(MAX_GIFT_AMOUNT_NAIRA)
  amount: number;
}
