import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Combined setup-page settings DTO covering:
 *  • Appearance  — theme material selection (themeMaterialId)
 *  • Supporter Interactions — thank-you message + show supporter count toggle
 */
export class UpdateCreatorSettingsDto {
  // ── Appearance ──────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    example: 'c1a2b3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'ID of the platform material to use as the creator page theme. Must be an active platform material UUID.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'themeMaterialId must be a valid UUID' })
  themeMaterialId?: string;

  // ── Supporter Interactions ───────────────────────────────────────────────

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
