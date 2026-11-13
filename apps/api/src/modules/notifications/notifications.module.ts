import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationListeners } from './notification.listeners';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { InfrastructureNotificationsModule } from '../../infrastructure/notifications/infrastructure-notifications.module';

@Module({
  imports: [InfrastructureNotificationsModule, PushNotificationsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcherService,
    NotificationListeners,
  ],
  exports: [NotificationsService, NotificationDispatcherService],
})
export class NotificationsModule {}
