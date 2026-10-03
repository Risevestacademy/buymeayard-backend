import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSupporterSettingsDto {
  @ApiPropertyOptional({
    example: 'Thank you so much for sending me a yard! 🙏 It means everything.',
    description:
      'Personalized thank-you message displayed after payment and included in the receipt email. Max 500 characters.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Thank you message cannot exceed 500 characters' })
  thankYouMessage?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Whether to display supporter count and public contributions on the public creator support page.',
  })
  @IsOptional()
  @IsBoolean()
  showSupportersOnPage?: boolean;
}
