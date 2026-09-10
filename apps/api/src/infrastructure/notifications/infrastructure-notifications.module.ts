import { Module, Logger } from '@nestjs/common';
import {
  NOTIFICATION_PROVIDER,
  NotificationProvider,
  SendNotificationPayload,
} from './notification-provider.interface';

class ConsoleNotificationProvider implements NotificationProvider {
  private readonly logger = new Logger(ConsoleNotificationProvider.name);

  async send(payload: SendNotificationPayload): Promise<void> {
    this.logger.log(
      `[Notification] To ${payload.recipientId}: ${payload.title} - ${payload.body}`,
    );
  }
}

@Module({
  providers: [
    {
      provide: NOTIFICATION_PROVIDER,
      useClass: ConsoleNotificationProvider,
    },
  ],
  exports: [NOTIFICATION_PROVIDER],
})
export class InfrastructureNotificationsModule {}
