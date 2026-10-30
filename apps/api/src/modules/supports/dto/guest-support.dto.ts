import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl, MaxLength } from 'class-validator';
import { DashboardContributionMaterialDto } from '../../creators/dto/creator-dashboard.dto';
import { CreateSupportIntentDto } from '../../creators/dto/create-support-intent.dto';

export class SupportQuoteResponseDto {
  @ApiProperty({ example: 500000, description: 'Amount in kobo' })
  amount!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({
    example: 2.5,
    description: 'Yard equivalent of the amount, to 2 decimal places',
  })
  yards!: number;

  @ApiProperty({
    type: DashboardContributionMaterialDto,
    description:
      "The creator's theme fabric the gift is counted in, same shape as the creator dashboard: id, name, color, thumbnailUrl and yards (quantity)",
  })
  material!: DashboardContributionMaterialDto;

  @ApiProperty({
    example: 'Adire',
    deprecated: true,
    description: 'Use material.name',
  })
  materialName!: string;
}

export class SupportIntentResponseDto extends SupportQuoteResponseDto {
  @ApiProperty({
    description:
      'Pass this to POST /payments/initialize to get the Paystack checkout URL',
  })
  supportId!: string;

  @ApiProperty({
    example: 'Thank you so much for your support! It means a lot.',
    description:
      "The creator's thank-you message (or the platform default) to show after payment",
  })
  thankYouMessage!: string;
}

export class CheckoutGiftDto extends CreateSupportIntentDto {
  @ApiPropertyOptional({
    example: 'https://buymeayard.com/adeola/thanks',
    description:
      'Page Paystack sends the supporter back to after paying. Must be on one of our own sites. We add `supportId` to it, and Paystack adds `reference` and `trxref`.',
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

export class CheckoutGiftResponseDto extends SupportIntentResponseDto {
  @ApiProperty({ description: 'The payment record created for this gift' })
  paymentId!: string;

  @ApiProperty({
    example: 'https://checkout.paystack.com/abc123',
    description: 'Send the supporter here to pay',
  })
  authorizationUrl!: string;
}
