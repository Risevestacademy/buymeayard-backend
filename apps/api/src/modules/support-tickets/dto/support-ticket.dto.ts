import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSupportTicketDto {
  @ApiProperty({
    example: 'My withdrawal failed but my bank details are correct.',
    description: 'What happened and what the user needs help with',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Tell us what happened' })
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({
    description:
      'Payout the message is about. Its reference, amount, date and status are attached.',
  })
  @IsOptional()
  @IsUUID()
  payoutId?: string;

  @ApiPropertyOptional({
    description:
      'Contribution the message is about. Its amount, date and status are attached.',
  })
  @IsOptional()
  @IsUUID()
  contributionId?: string;
}

export class SupportTicketResponseDto {
  @ApiProperty({ example: '6f1c2c1e-1b0a-4d8e-9b0e-2f7c9a1d3e4f' })
  id!: string;

  @ApiProperty({
    example: 'OPEN',
    enum: ['OPEN', 'RESOLVED'],
    description: 'OPEN until the support team resolves it',
  })
  status!: string;

  @ApiProperty({ example: '2026-10-17T10:00:00.000Z' })
  createdAt!: Date;
}
