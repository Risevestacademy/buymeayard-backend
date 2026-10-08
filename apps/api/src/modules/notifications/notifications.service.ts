import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NOTIFICATION_PROVIDER } from '../../infrastructure/notifications/notification-provider.interface';
import type { NotificationProvider } from '../../infrastructure/notifications/notification-provider.interface';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import {
  NotificationsFeedResponseDto,
  NotificationItemDto,
} from './dto/notification-feed.dto';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly notificationProvider: NotificationProvider,
  ) {}

  /**
   * Retrieves paginated notifications with unread counter, category filters, and read receipts.
   */
  async getUserNotifications(
    userId: string,
    query?: QueryNotificationsDto,
  ): Promise<NotificationsFeedResponseDto> {
    const page = Math.max(1, query?.page || 1);
    const limit = Math.min(50, Math.max(1, query?.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (query?.category) {
      where.category = query.category.toUpperCase();
    }
    if (query?.unreadOnly) {
      where.readAt = null;
    }

    const [unreadCount, total, items] = await Promise.all([
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const mappedItems: NotificationItemDto[] = items.map((item) => ({
      id: item.id,
      category: item.category,
      type: item.type,
      title: item.title,
      body: item.body,
      data: (item.data as Record<string, any>) || null,
      actionUrl: item.actionUrl,
      readAt: item.readAt,
      isRead: Boolean(item.readAt),
      createdAt: item.createdAt,
    }));

    return {
      unreadCount,
      items: mappedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Marks a single notification as read.
   */
  async markAsRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Notification not found.',
      });
    }

    return {
      success: true,
      message: 'Notification marked as read.',
    };
  }

  /**
   * Marks all unread notifications for user as read.
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      success: true,
      markedCount: result.count,
      message: 'All notifications marked as read.',
    };
  }

  /**
   * Deletes a single notification.
   */
  async deleteNotification(userId: string, notificationId: string) {
    const existing = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!existing || existing.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Notification not found.',
      });
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return {
      success: true,
      message: 'Notification deleted successfully.',
    };
  }
}
