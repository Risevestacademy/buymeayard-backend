import { NotificationListeners } from './notification.listeners';
import {
  PayoutNotificationEvent,
  ContributionNotificationEvent,
  KycNotificationEvent,
} from './events/notification.events';

describe('NotificationListeners', () => {
  let listeners: NotificationListeners;
  let prisma: {
    session: { findMany: jest.Mock };
  };
  let dispatcher: {
    dispatchPayoutNotification: jest.Mock;
    dispatchContributionNotification: jest.Mock;
    dispatchSecurityAlertNotification: jest.Mock;
    dispatchKycNotification: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      session: { findMany: jest.fn() },
    };
    dispatcher = {
      dispatchPayoutNotification: jest.fn().mockResolvedValue(undefined),
      dispatchContributionNotification: jest.fn().mockResolvedValue(undefined),
      dispatchSecurityAlertNotification: jest.fn().mockResolvedValue(undefined),
      dispatchKycNotification: jest.fn().mockResolvedValue(undefined),
    };

    listeners = new NotificationListeners(prisma as never, dispatcher as never);
  });

  describe('payout event listeners', () => {
    const payoutEvent: PayoutNotificationEvent = {
      payoutId: 'payout-1',
      creatorUserId: 'user-1',
      amount: 1000000,
      currency: 'NGN',
    };

    it('handles payout.created', async () => {
      await listeners.handlePayoutCreated(payoutEvent);
      expect(dispatcher.dispatchPayoutNotification).toHaveBeenCalledWith(
        payoutEvent,
        'CREATED',
      );
    });

    it('handles payout.processing', async () => {
      await listeners.handlePayoutProcessing(payoutEvent);
      expect(dispatcher.dispatchPayoutNotification).toHaveBeenCalledWith(
        payoutEvent,
        'PROCESSING',
      );
    });

    it('handles payout.success', async () => {
      await listeners.handlePayoutSuccess(payoutEvent);
      expect(dispatcher.dispatchPayoutNotification).toHaveBeenCalledWith(
        payoutEvent,
        'SUCCESS',
      );
    });

    it('handles payout.failed', async () => {
      await listeners.handlePayoutFailed(payoutEvent);
      expect(dispatcher.dispatchPayoutNotification).toHaveBeenCalledWith(
        payoutEvent,
        'FAILED',
      );
    });
  });

  describe('handleContributionReceived', () => {
    it('dispatches contribution notification', async () => {
      const contribEvent: ContributionNotificationEvent = {
        supportId: 'sup-1',
        creatorUserId: 'user-1',
        supporterName: 'Tunde',
        yards: 2,
        materialName: 'Aso Oke',
        amount: 2000000,
      };

      await listeners.handleContributionReceived(contribEvent);
      expect(dispatcher.dispatchContributionNotification).toHaveBeenCalledWith(
        contribEvent,
      );
    });
  });

  describe('handleUserLogin (device detection)', () => {
    const macChromeAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const windowsEdgeAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

    it('does not alert if user has no prior sessions (first sign-in)', async () => {
      prisma.session.findMany.mockResolvedValue([]);

      await listeners.handleUserLogin({
        userId: 'user-1',
        email: 'ada@example.com',
        ipAddress: '127.0.0.1',
        userAgent: macChromeAgent,
        sessionId: 'sess-first',
      });

      expect(dispatcher.dispatchSecurityAlertNotification).not.toHaveBeenCalled();
    });

    it('does not alert if signing in from a known device/browser family', async () => {
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'sess-old',
          userAgent: macChromeAgent,
          ipAddress: '127.0.0.1',
        },
      ]);

      await listeners.handleUserLogin({
        userId: 'user-1',
        email: 'ada@example.com',
        ipAddress: '127.0.0.1',
        userAgent: macChromeAgent,
        sessionId: 'sess-new',
      });

      expect(dispatcher.dispatchSecurityAlertNotification).not.toHaveBeenCalled();
    });

    it('dispatches security alert when a genuinely new device/browser signs in', async () => {
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'sess-old',
          userAgent: macChromeAgent,
          ipAddress: '127.0.0.1',
        },
      ]);

      await listeners.handleUserLogin({
        userId: 'user-1',
        email: 'ada@example.com',
        ipAddress: '102.89.23.45',
        userAgent: windowsEdgeAgent,
        sessionId: 'sess-new-device',
      });

      expect(dispatcher.dispatchSecurityAlertNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          email: 'ada@example.com',
          deviceLabel: expect.stringContaining('Edge on Windows'),
          sessionId: 'sess-new-device',
        }),
      );
    });
  });

  describe('handleKycStatusChanged', () => {
    it('dispatches kyc notification', async () => {
      const kycEvent: KycNotificationEvent = {
        creatorUserId: 'user-1',
        status: 'VERIFIED',
      };

      await listeners.handleKycStatusChanged(kycEvent);
      expect(dispatcher.dispatchKycNotification).toHaveBeenCalledWith(kycEvent);
    });
  });
});
