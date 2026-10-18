import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: any;

  beforeEach(async () => {
    service = {
      getUserNotifications: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      deleteNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('delegates getUserNotifications to service with query', async () => {
    service.getUserNotifications.mockResolvedValue({
      unreadCount: 1,
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    const res = await controller.getNotifications('usr_1', {
      page: 1,
      limit: 20,
    });

    expect(service.getUserNotifications).toHaveBeenCalledWith('usr_1', {
      page: 1,
      limit: 20,
    });
    expect(res.unreadCount).toBe(1);
  });

  it('delegates markRead to service', async () => {
    service.markAsRead.mockResolvedValue({ success: true });

    const res = await controller.markRead('usr_1', 'n_1');

    expect(service.markAsRead).toHaveBeenCalledWith('usr_1', 'n_1');
    expect(res).toEqual({ success: true });
  });

  it('delegates markAllRead to service', async () => {
    service.markAllAsRead.mockResolvedValue({
      success: true,
      markedCount: 3,
    });

    const res = await controller.markAllRead('usr_1');

    expect(service.markAllAsRead).toHaveBeenCalledWith('usr_1');
    expect(res).toEqual({ success: true, markedCount: 3 });
  });

  it('delegates deleteNotification to service', async () => {
    service.deleteNotification.mockResolvedValue({ success: true });

    const res = await controller.deleteNotification('usr_1', 'n_1');

    expect(service.deleteNotification).toHaveBeenCalledWith('usr_1', 'n_1');
    expect(res).toEqual({ success: true });
  });
});
