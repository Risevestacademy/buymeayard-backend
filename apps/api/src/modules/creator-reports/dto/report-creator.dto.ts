import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** The reasons on the Report a creator form, with the label shown on it. */
export const CREATOR_REPORT_REASON_LABELS = {
  BULLYING_AND_HARASSMENT: 'Bullying and Harassment',
  ILLEGAL_ACTIVITY: 'Illegal activity',
  SEXUAL_CONTENT: 'Nudity or sexually explicit content',
  HATE_SPEECH: 'Hate speech or discrimination',
  MISLEADING_INFORMATION: 'Inaccurate or misleading information',
  SCAM_OR_FRAUD: 'Scam or fraudulent activity',
  INTELLECTUAL_PROPERTY: 'Intellectual property infringement',
  OTHER: 'Others',
} as const;
export type CreatorReportReason = keyof typeof CREATOR_REPORT_REASON_LABELS;
export const CREATOR_REPORT_REASONS = Object.keys(
  CREATOR_REPORT_REASON_LABELS,
) as CreatorReportReason[];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Trims, treats an empty field as missing, and adds https:// when the
 * reporter typed a bare address like `example.com`. */
const link = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if (!v) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
};

const LINK_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
};

/** Sent as multipart/form-data, because the form can include a file. */
export class ReportCreatorDto {
  @ApiProperty({
    enum: CREATOR_REPORT_REASONS,
    example: 'SCAM_OR_FRAUD',
    description: 'Why the creator is being reported (the form has 8 options)',
  })
  @IsIn(CREATOR_REPORT_REASONS, { message: 'Choose a reason' })
  reason!: CreatorReportReason;

  @ApiProperty({
    example: 'This page asks supporters to pay into a different account.',
    description: 'What happened (1–2000 characters)',
    maxLength: 2000,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Tell us what happened' })
  @MaxLength(2000)
  description!: string;

  @ApiProperty({
    example: 'https://example.com/proof',
    description:
      'Link to evidence 1. A bare address like `example.com` gets `https://` added.',
  })
  @Transform(link)
  @IsNotEmpty({ message: 'Add a link to your evidence' })
  @IsUrl(LINK_OPTIONS, { message: 'Enter a valid link' })
  @MaxLength(2000)
  evidenceLink1!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/more-proof',
    description: 'Link to evidence 2 (optional)',
  })
  @IsOptional()
  @Transform(link)
  @IsUrl(LINK_OPTIONS, { message: 'Enter a valid link' })
  @MaxLength(2000)
  evidenceLink2?: string;

  @ApiProperty({
    example: 'reporter@example.com',
    description:
      'Where we can reach the reporter for more details. Never shown to the creator.',
  })
  @Transform(trim)
  @IsNotEmpty({ message: 'Enter your email address' })
  @IsEmail({}, { message: 'Enter a valid email' })
  @MaxLength(254)
  reporterEmail!: string;
}

export class ReportCreatorResponseDto {
  @ApiProperty({ example: 'a3b1c2d4-0000-4000-8000-000000000000' })
  id!: string;

  @ApiProperty({ example: 'PENDING' })
  status!: string;
}
