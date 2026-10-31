import { ApiProperty } from '@nestjs/swagger';
import { DashboardContributionMaterialDto } from '../../creators/dto/creator-dashboard.dto';

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

  @ApiProperty({ example: 5000, description: 'Amount in naira' })
  amount!: number;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ example: 2.5 })
  yards!: number;

  @ApiProperty({
    type: DashboardContributionMaterialDto,
    nullable: true,
    description:
      'The fabric gifted, same shape as the creator dashboard: id, name, color, thumbnailUrl and yards (quantity)',
  })
  material!: DashboardContributionMaterialDto | null;

  @ApiProperty({
    example: 'Adire',
    nullable: true,
    type: String,
    deprecated: true,
    description: 'Use material.name',
  })
  materialName!: string | null;

  @ApiProperty({ example: 'Adeola Johnson', nullable: true, type: String })
  creatorName!: string | null;

  @ApiProperty({
    example: 'Thank you so much for your support! It means a lot.',
    description: "The creator's thank-you message, or the platform default",
  })
  thankYouMessage!: string;
}
