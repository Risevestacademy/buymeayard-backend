import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const CREATOR_REPORT_REASONS = [
  'FRAUD_OR_SCAM',
  'IMPERSONATION',
  'INAPPROPRIATE_CONTENT',
  'COPYRIGHT',
  'HARASSMENT',
  'OTHER',
] as const;
export type CreatorReportReason = (typeof CREATOR_REPORT_REASONS)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ReportCreatorDto {
  @ApiProperty({
    enum: CREATOR_REPORT_REASONS,
    example: 'FRAUD_OR_SCAM',
    description: 'Why the creator is being reported',
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

  @ApiPropertyOptional({
    example: 'reporter@example.com',
    description: 'Where we can reach the reporter. Never shown to the creator.',
  })
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email' })
  @MaxLength(254)
  reporterEmail?: string;
}

export class ReportCreatorResponseDto {
  @ApiProperty({ example: 'a3b1c2d4-0000-4000-8000-000000000000' })
  id!: string;

  @ApiProperty({ example: 'PENDING' })
  status!: string;
}
