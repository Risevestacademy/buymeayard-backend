import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import {
  PAYOUT_EVENTS,
  PayoutNotificationEvent,
  CONTRIBUTION_EVENTS,
  ContributionNotificationEvent,
  KYC_NOTIFICATION_EVENTS,
  KycNotificationEvent,
} from './events/notification.events';
import { USER_EVENTS, UserLoginEvent } from '../analytics/events/user.events';
import {
  parseUserAgent,
  resolveLocationFromIp,
} from '../../common/utils/session-parser.util';

export interface ExtendedUserLoginEvent extends UserLoginEvent {
  userAgent?: string;
  sessionId?: string;
}

@Injectable()
export class NotificationListeners {
  private readonly logger = new Logger(NotificationListeners.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  /**
   * Payout Processing Lifecycle Listeners
   */
  @OnEvent(PAYOUT_EVENTS.CREATED)
  async handlePayoutCreated(event: PayoutNotificationEvent) {
    this.logger.log(`Handling payout.created for creator: ${event.creatorUserId}`);
    await this.dispatcher.dispatchPayoutNotification(event, 'CREATED');
  }

  @OnEvent(PAYOUT_EVENTS.PROCESSING)
  async handlePayoutProcessing(event: PayoutNotificationEvent) {
    this.logger.log(`Handling payout.processing for creator: ${event.creatorUserId}`);
    await this.dispatcher.dispatchPayoutNotification(event, 'PROCESSING');
  }

  @OnEvent(PAYOUT_EVENTS.SUCCESS)
  async handlePayoutSuccess(event: PayoutNotificationEvent) {
    this.logger.log(`Handling payout.success for creator: ${event.creatorUserId}`);
    await this.dispatcher.dispatchPayoutNotification(event, 'SUCCESS');
  }

  @OnEvent(PAYOUT_EVENTS.FAILED)
  async handlePayoutFailed(event: PayoutNotificationEvent) {
    this.logger.log(`Handling payout.failed for creator: ${event.creatorUserId}`);
    await this.dispatcher.dispatchPayoutNotification(event, 'FAILED');
  }

  /**
   * Contribution Completed Listener (received by creator)
   */
  @OnEvent(CONTRIBUTION_EVENTS.RECEIVED)
  async handleContributionReceived(event: ContributionNotificationEvent) {
    this.logger.log(
      `Handling contribution.received for creator: ${event.creatorUserId} from supporter: ${event.supporterName}`,
    );
    await this.dispatcher.dispatchContributionNotification(event);
  }

  /**
   * New Login Location / Device Detection
   */
  @OnEvent(USER_EVENTS.LOGIN)
  async handleUserLogin(event: ExtendedUserLoginEvent) {
    try {
      if (!event.userId) return;

      // Find user's past sessions to compare against
      const previousSessions = await this.prisma.session.findMany({
        where: {
          userId: event.userId,
          ...(event.sessionId ? { id: { not: event.sessionId } } : {}),
        },
        take: 10,
        orderBy: { updatedAt: 'desc' },
      });

      // If this is the user's only session ever, no previous baseline to alert on
      if (previousSessions.length === 0) {
        return;
      }

      const currentClient = parseUserAgent(event.userAgent);
      const currentLocation = resolveLocationFromIp(event.ipAddress);

      // Check if any previous session matches current client's device/OS & browser family
      const isKnownDevice = previousSessions.some((prev) => {
        const prevClient = parseUserAgent(prev.userAgent);
        return (
          prevClient.os === currentClient.os &&
          prevClient.browser === currentClient.browser
        );
      });

      if (!isKnownDevice) {
        this.logger.warn(
          `New device sign-in detected for ${event.email}: ${currentClient.deviceLabel} (${currentLocation})`,
        );

        await this.dispatcher.dispatchSecurityAlertNotification({
          userId: event.userId,
          email: event.email,
          deviceLabel: currentClient.deviceLabel,
          location: currentLocation,
          ipAddress: event.ipAddress,
          sessionId: event.sessionId,
        });
      }
    } catch (err) {
      this.logger.error('Error detecting new device sign-in:', err);
    }
  }

  /**
   * KYC Verification Status Change
   */
  @OnEvent(KYC_NOTIFICATION_EVENTS.STATUS_CHANGED)
  async handleKycStatusChanged(event: KycNotificationEvent) {
    this.logger.log(
      `Handling kyc.status_changed for creator: ${event.creatorUserId} status: ${event.status}`,
    );
    await this.dispatcher.dispatchKycNotification(event);
  }
}
