import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreatorStatus,
  KycDocumentType,
  KycStatus,
  KycSubmissionStatus,
} from '@buymeayard/types';

export class KycPrefillDto {
  @ApiPropertyOptional({
    example: 'Mariam',
    description: 'Pre-filled legal first name',
    nullable: true,
  })
  firstName: string | null;

  @ApiPropertyOptional({
    example: 'Omiteru',
    description: 'Pre-filled legal last name',
    nullable: true,
  })
  lastName: string | null;
}

export class KycLatestSubmissionDto {
  @ApiProperty({
    example: 'b5f08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'Submission ID',
  })
  id: string;

  @ApiProperty({
    enum: KycSubmissionStatus,
    example: KycSubmissionStatus.IN_PROGRESS,
    description: 'Current submission status',
  })
  status: KycSubmissionStatus;

  @ApiPropertyOptional({
    enum: KycDocumentType,
    example: KycDocumentType.NATIONAL_ID,
    description: 'Submitted document type',
    nullable: true,
  })
  documentType: KycDocumentType | null;

  @ApiProperty({
    example: '2026-10-01T12:00:00.000Z',
    description: 'Timestamp when verification session started',
  })
  createdAt: string;

  @ApiPropertyOptional({
    example: '2026-10-01T12:05:00.000Z',
    description: 'Timestamp when verification completed',
    nullable: true,
  })
  completedAt: string | null;

  @ApiPropertyOptional({
    example: 'Document was blurry. Please resubmit with clear photo.',
    description: 'Creator-safe rejection reason if unsuccessful',
    nullable: true,
  })
  rejectionReason: string | null;
}

export class KycStatusResponseDto {
  @ApiProperty({
    enum: KycStatus,
    example: KycStatus.NOT_SUBMITTED,
    description: 'Overall creator KYC verification status',
  })
  kycStatus: KycStatus;

  @ApiProperty({
    enum: CreatorStatus,
    example: CreatorStatus.PROFILE_CREATED,
    description: 'Creator profile account lifecycle status',
  })
  creatorStatus: CreatorStatus;

  @ApiProperty({
    example: false,
    description:
      'Whether the creator can receive yard contributions on their public page',
  })
  contributionsEnabled: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether the creator is eligible to start a new KYC session',
  })
  canStartSession: boolean;

  @ApiProperty({
    type: KycPrefillDto,
    description: 'Pre-filled name values for the identity details form',
  })
  prefill: KycPrefillDto;

  @ApiPropertyOptional({
    type: KycLatestSubmissionDto,
    description: 'Details of the latest verification attempt, if any',
    nullable: true,
  })
  latestSubmission: KycLatestSubmissionDto | null;
}

export class StartKycSessionResponseDto {
  @ApiProperty({
    example: 'b5f08cb1-80a5-48fa-88f5-93df380e227a',
    description: 'Unique KYC submission record ID',
  })
  submissionId: string;

  @ApiProperty({
    enum: KycSubmissionStatus,
    example: KycSubmissionStatus.CREATED,
    description: 'Initial session status',
  })
  status: KycSubmissionStatus;

  @ApiProperty({
    example:
      'https://verify.didit.me/session/c1a2b3d4-e5f6-7890-abcd-ef1234567890',
    description:
      'Hosted verification URL. Open in iframe or redirect in web browser.',
  })
  verificationUrl: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Session token for Didit React Native mobile SDK',
  })
  sessionToken: string;

  @ApiProperty({
    example: false,
    description:
      'True if an existing unfinished session with identical details was resumed',
  })
  resumed: boolean;
}
