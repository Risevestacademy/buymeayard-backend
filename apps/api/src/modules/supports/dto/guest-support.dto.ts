import { ApiProperty } from '@nestjs/swagger';

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
    example: 'Adire',
    description: "The creator's theme fabric the gift is counted in",
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
