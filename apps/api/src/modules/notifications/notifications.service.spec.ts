import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NOTIFICATION_PROVIDER } from '../../infrastructure/notifications/notification-provider.interface';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let notificationProvider: any;

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    notificationProvider = {
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NOTIFICATION_PROVIDER, useValue: notificationProvider },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('getUserNotifications', () => {
    it('returns paginated feed with unread count and category filters', async () => {
      prisma.notification.count
        .mockResolvedValueOnce(3) // unreadCount
        .mockResolvedValueOnce(15); // total matching

      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'n_1',
          category: 'PAYOUT',
          type: 'PAYOUT_COMPLETED',
          title: 'Money landed',
          body: '₦450,000 sent to Access Bank',
          data: { amount: 450000 },
          actionUrl: '/dashboard/payouts',
          readAt: null,
          createdAt: new Date('2026-10-08T10:00:00Z'),
        },
        {
          id: 'n_2',
          category: 'PAYOUT',
          type: 'PAYOUT_CREATED',
          title: 'Withdrawal submitted',
          body: '₦450,000 requested',
          data: { amount: 450000 },
          actionUrl: '/dashboard/payouts',
          readAt: new Date('2026-10-08T09:00:00Z'),
          createdAt: new Date('2026-10-08T09:00:00Z'),
        },
      ]);

      const res = await service.getUserNotifications('usr_1', {
        page: 1,
        limit: 10,
        category: 'PAYOUT',
        unreadOnly: false,
      });

      expect(res.unreadCount).toBe(3);
      expect(res.items).toHaveLength(2);
      expect(res.items[0].isRead).toBe(false);
      expect(res.items[1].isRead).toBe(true);
      expect(res.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 15,
        totalPages: 2,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'usr_1', category: 'PAYOUT' },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('filters only unread notifications when unreadOnly is true', async () => {
      prisma.notification.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);
      prisma.notification.findMany.mockResolvedValue([]);

      await service.getUserNotifications('usr_1', {
        page: 1,
        limit: 20,
        unreadOnly: true,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'usr_1', readAt: null },
        }),
      );
    });
  });

  describe('markAsRead', () => {
    it('throws NotFoundException if notification does not exist', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markAsRead('usr_1', 'n_missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks notification as read successfully', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.markAsRead('usr_1', 'n_1');

      expect(res.success).toBe(true);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'n_1', userId: 'usr_1' },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('marks all unread notifications for user as read', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const res = await service.markAllAsRead('usr_1');

      expect(res.success).toBe(true);
      expect(res.markedCount).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr_1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });

  describe('deleteNotification', () => {
    it('throws NotFoundException if notification does not exist or belongs to another user', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteNotification('usr_1', 'n_missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes notification successfully', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n_1',
        userId: 'usr_1',
      });
      prisma.notification.delete.mockResolvedValue({ id: 'n_1' });

      const res = await service.deleteNotification('usr_1', 'n_1');

      expect(res.success).toBe(true);
      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'n_1' },
      });
    });
  });
});
