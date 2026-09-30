import { IsUUID, IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty({
    description: 'Support order ID to initialize payment for',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  supportId: string;

  @ApiPropertyOptional({
    description:
      'Supporter email address for checkout receipt and confirmation',
    example: 'supporter@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description:
      'Custom callback URL redirect after payment completes on Paystack',
    example: 'https://buymeayard.com/payment/callback',
  })
  @IsOptional()
  @IsString()
  callbackUrl?: string;
}

export class InitializePaymentResponseDto {
  @ApiProperty({
    description: 'Internal Payment ID',
    example: '234e4567-e89b-12d3-a456-426614174000',
  })
  paymentId: string;

  @ApiProperty({
    description: 'Paystack provider transaction reference',
    example: 'pstk_ref_1727700000_234e4567',
  })
  providerReference: string;

  @ApiProperty({
    description: 'Paystack hosted checkout URL for the supporter',
    example: 'https://checkout.paystack.com/0123456789abcdef',
  })
  authorizationUrl: string;

  @ApiPropertyOptional({
    description: 'Paystack access code',
    example: '0123456789abcdef',
  })
  accessCode?: string;
}
