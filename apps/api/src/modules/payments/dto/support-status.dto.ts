import { ApiProperty } from '@nestjs/swagger';

export class SupportStatusResponseDto {
  @ApiProperty()
  supportId!: string;

  @ApiProperty({
    example: 'PAYMENT_PENDING',
    description:
      'CREATED, PAYMENT_PENDING, PAID, COMPLETED, PAYMENT_FAILED, CANCELLED, REFUNDED, ...',
  })
  status!: string;

  @ApiProperty({
    example: true,
    description:
      'True once Paystack has confirmed the payment (PAID or COMPLETED). Show the thank-you screen only when this is true.',
  })
  paid!: boolean;

  @ApiProperty({ example: 500000, description: 'Amount in kobo' })
  amount!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ example: 2.5 })
  yards!: number;

  @ApiProperty({ example: 'Adire', nullable: true, type: String })
  materialName!: string | null;

  @ApiProperty({ example: 'Adeola Johnson', nullable: true, type: String })
  creatorName!: string | null;

  @ApiProperty({
    example: 'Thank you so much for your support! It means a lot.',
    description: "The creator's thank-you message, or the platform default",
  })
  thankYouMessage!: string;
}
