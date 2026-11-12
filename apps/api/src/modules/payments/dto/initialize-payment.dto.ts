import { IsEmail, IsOptional, IsUrl, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty({ description: 'The support id returned when it was created' })
  @IsUUID()
  supportId: string;

  @ApiPropertyOptional({
    example: 'jane@example.com',
    description:
      'Receipt email. Falls back to the email given on the guest intent, then a platform placeholder address.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    example: 'https://buymeayard.com/adeola/thanks',
    description:
      'Page Bachs sends the supporter back to after paying. Must be on one of our own sites. We add `supportId` to it, and Bachs adds `reference` and `trxref`. Call GET /supports/:supportId/status there to confirm the payment.',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  @MaxLength(2000)
  callbackUrl?: string;
}

export class InitializePaymentResponseDto {
  @ApiProperty({ description: 'The payment record created for this support' })
  paymentId!: string;

  @ApiProperty({
    example: 'BMY-1730000000000-ab12cd',
    description: 'Bachs checkout id (chk_…) for this payment',
  })
  providerReference!: string;

  @ApiProperty({
    example: 'https://checkout.bachs.io/c/abc123',
    description: 'Send the supporter here to pay',
  })
  authorizationUrl!: string;
}
