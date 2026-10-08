import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ example: '/dashboard/payouts', nullable: true })
  actionUrl!: string | null;

  @ApiProperty({ example: null, nullable: true })
  readAt!: Date | null;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiProperty({ example: '2026-10-08T20:30:00.000Z' })
  createdAt!: Date;
}

export class NotificationPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 35 })
  total!: number;

  @ApiProperty({ example: 2 })
  totalPages!: number;
}

export class NotificationsFeedResponseDto {
  @ApiProperty({ example: 4, description: 'Total number of unread notifications' })
  unreadCount!: number;

  @ApiProperty({ type: () => [NotificationItemDto] })
  items!: NotificationItemDto[];

  @ApiProperty({ type: () => NotificationPaginationDto })
  pagination!: NotificationPaginationDto;
}
