import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorBodyDto {
  @ApiProperty({
    example: 'INSUFFICIENT_FUNDS',
    description:
      'Stable machine-readable code from ErrorCodes. Branch on this, not on the message.',
  })
  code!: string;

  @ApiProperty({
    example: 'Requested payout (5000000) exceeds available balance (4500000)',
    description:
      'Human-readable message. For validation errors (`BAD_REQUEST`) it is the first failed rule, written to show under the field.',
  })
  message!: string;

  @ApiPropertyOptional({
    type: Object,
    description:
      'Rarely present. Auth endpoints include the auth provider’s original error body here. Validation errors don’t use it: `message` holds the first failed rule.',
  })
  details?: unknown;
}

/**
 * The shape every error response has, produced by HttpExceptionFilter:
 * `{ "error": { code, message, details? } }`.
 */
export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
