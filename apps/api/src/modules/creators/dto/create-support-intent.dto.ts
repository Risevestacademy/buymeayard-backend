import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Length,
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
    description: `Amount the supporter wishes to gift, in \`currency\` (major units; Naira when \`currency\` is omitted). Its Naira equivalent must be between ${MIN_GIFT_AMOUNT_NAIRA} and ${MAX_GIFT_AMOUNT_NAIRA}.`,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'Currency the supporter sees and pays in, from GET /payments/currencies. Anything not offered falls back to NGN.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

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
    description:
      'Amount in `currency` (major units; Naira when `currency` is omitted)',
  })
  @Type(() => Number) // query params arrive as strings
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    example: 'USD',
    description:
      'Currency of `amount`, from GET /payments/currencies. Anything not offered falls back to NGN.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
