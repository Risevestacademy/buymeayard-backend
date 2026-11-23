import { ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class NotificationItemDto {
  @ApiProperty({ example: 'notif_123' })
  id!: string;

  @ApiProperty({
    example: 'PAYOUT',
    enum: ['PAYOUT', 'CONTRIBUTION', 'SECURITY', 'KYC', 'GENERAL'],
  })
  category!: string;

  @ApiProperty({ example: 'PAYOUT_COMPLETED' })
  type!: string;

  @ApiProperty({ example: 'Money landed' })
  title!: string;

  @ApiProperty({
    example:
      '₦450,000 has been deposited into your Access Bank account ending in ••••4589.',
  })
  body!: string;

  @ApiProperty({
    example: { amount: 450000, bank: 'Access Bank' },
    nullable: true,
  })
  data!: Record<string, any> | null;

  @ApiProperty({
    example: 'a1b2c3',
    nullable: true,
    description: 'Payout to open. Set on PAYOUT notifications, otherwise null.',
  })
  payoutId!: string | null;

  @ApiProperty({
    example: 'd4e5f6',
    nullable: true,
    description:
      'Contribution (support) to open. Set on CONTRIBUTION notifications, otherwise null.',
  })
  contributionId!: string | null;

  @ApiProperty({ example: '/dashboard/payouts', nullable: true })
  actionUrl!: string | null;

  @ApiProperty({ example: null, nullable: true })
  readAt!: Date | null;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({ example: '2026-10-08T20:30:00.000Z' })
  createdAt!: Date;
}

export class NotificationsFeedResponseDto {
  @ApiProperty({
    example: 4,
    description: 'Total number of unread notifications',
  })
  unreadCount!: number;

  @ApiProperty({ type: () => [NotificationItemDto] })
  items!: NotificationItemDto[];

  @ApiProperty({ type: () => PaginationDto })
  pagination!: PaginationDto;
}
