import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { KycDocumentType } from '@buymeayard/types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

export const SUPPORTED_KYC_COUNTRIES = ['NGA'] as const;

export class StartKycSessionDto {
  @ApiPropertyOptional({
    example: 'Mariam',
    description:
      'Legal first name as on the ID (optional; Didit extracts from document)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  @Matches(NAME_PATTERN, { message: 'First name contains invalid characters' })
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Omiteru',
    description:
      'Legal last name as on the ID (optional; Didit extracts from document)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  @Matches(NAME_PATTERN, { message: 'Last name contains invalid characters' })
  lastName?: string;

  @ApiPropertyOptional({
    example: '1995-10-12',
    description: 'Date of birth (YYYY-MM-DD, optional)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Date of birth must be in YYYY-MM-DD format',
  })
  dateOfBirth?: string;

  @ApiPropertyOptional({
    example: 'NGA',
    enum: SUPPORTED_KYC_COUNTRIES,
    description:
      'Country of the identity document (ISO 3166-1 alpha-3, optional)',
  })
  @IsOptional()
  @IsIn(SUPPORTED_KYC_COUNTRIES, {
    message: 'Identity verification is currently only available for Nigeria',
  })
  country?: string;

  @ApiPropertyOptional({
    enum: KycDocumentType,
    example: KycDocumentType.NATIONAL_ID,
    description:
      'Document type (optional; user can choose document directly in Didit)',
  })
  @IsOptional()
  @IsEnum(KycDocumentType, { message: 'Unsupported document type' })
  documentType?: KycDocumentType;
}
