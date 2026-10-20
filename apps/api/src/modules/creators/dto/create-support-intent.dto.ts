import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupportIntentDto {
  @ApiProperty({
    example: 2000,
    description: 'Amount in Naira (major units) the supporter wishes to donate',
  })
  @IsNumber()
  @IsPositive()
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
    default: false,
    description: "If true, hides the supporter's identity from the public wall",
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}
