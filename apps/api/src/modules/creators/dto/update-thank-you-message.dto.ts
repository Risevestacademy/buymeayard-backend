import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateThankYouMessageDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 500,
    example: 'Thank you so much for sending me a yard! 🙏',
    description:
      'The thank-you message shown after payment. Send null (or blank text) to clear it and use the platform default. The key must always be present.',
  })
  @ValidateIf((o) => o.thankYouMessage !== null)
  @IsString()
  @MaxLength(500, { message: 'Thank you message cannot exceed 500 characters' })
  thankYouMessage: string | null;
}