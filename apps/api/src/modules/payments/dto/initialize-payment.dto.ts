import { IsEmail, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty({ description: 'The support id returned when it was created' })
  @IsUUID()
  supportId: string;

  @ApiPropertyOptional({
    example: 'jane@example.com',
    description:
      'Paystack receipt email. Falls back to the email given on the guest intent, then a platform placeholder address.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class InitializePaymentResponseDto {
  @ApiProperty({ description: 'The payment record created for this support' })
  paymentId!: string;

  @ApiProperty({
    example: 'BMY-1730000000000-ab12cd',
    description: 'Reference Paystack uses for this charge',
  })
  providerReference!: string;

  @ApiProperty({
    example: 'https://checkout.paystack.com/abc123',
    description: 'Send the supporter here to pay',
  })
  authorizationUrl!: string;
}
