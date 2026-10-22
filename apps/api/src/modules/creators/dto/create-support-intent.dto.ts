import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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
    description:
      'Where the payment receipt is sent. Optional, but without it Paystack sends the receipt to a platform placeholder address.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      "If true, hides the supporter's name and message from the public wall, and the name from the creator",
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
