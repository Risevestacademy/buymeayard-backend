import { NotificationDispatcherService } from './notification-dispatcher.service';
import {
  PayoutNotificationEvent,
  ContributionNotificationEvent,
  NewDeviceLoginEvent,
  KycNotificationEvent,
} from './events/notification.events';

describe('NotificationDispatcherService', () => {
  let service: NotificationDispatcherService;
  let prisma: {
    notification: { create: jest.Mock };
    notificationPreference: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) },
      notificationPreference: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    service = new NotificationDispatcherService(prisma as never);
    // Mock sendEmail to avoid network calls during tests
    jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
  });

  describe('dispatchPayoutNotification', () => {
    const payoutEvent: PayoutNotificationEvent = {
      payoutId: 'payout-123',
      creatorUserId: 'user-1',
      amount: 4500000, // ₦45,000 in kobo
      fee: 5000,
      netAmount: 4495000,
      currency: 'NGN',
      reference: 'PYT-20250925-0041',
      bankName: 'GTBank',
      accountNumberMasked: '••••4589',
    };

    function allowAll() {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Isaac Shosanya',
        email: 'isaac@example.com',
      });
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        inAppOnPayout: true,
        emailOnPayout: true,
      });
    }

    it('sends "Money landed" with the net amount and breakdown', async () => {
      allowAll();

      await service.dispatchPayoutNotification(payoutEvent, 'SUCCESS');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          category: 'PAYOUT',
          type: 'PAYOUT_COMPLETED',
          title: 'Money landed',
          body: '₦44,950 has been sent to your GTBank account (••••4589).',
          actionUrl: '/dashboard/payouts?payoutId=payout-123',
        }),
      });
      const html = (service.sendEmail as jest.Mock).mock.calls[0][2];
      expect(service.sendEmail).toHaveBeenCalledWith(
        'isaac@example.com',
        'Money landed',
        expect.any(String),
      );
      expect(html).toContain('Hi Isaac,');
      expect(html).toContain('₦45,000');
      expect(html).toContain('₦50');
      expect(html).toContain('Reference: PYT-20250925-0041');
    });

    it('respects user preference when in-app and email are disabled', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Isaac Shosanya',
        email: 'isaac@example.com',
      });
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        inAppOnPayout: false,
        emailOnPayout: false,
      });

      await service.dispatchPayoutNotification(payoutEvent, 'SUCCESS');

      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(service.sendEmail).not.toHaveBeenCalled();
    });

    it('tells the creator the full amount was restored when a payout fails', async () => {
      allowAll();

      await service.dispatchPayoutNotification(payoutEvent, 'FAILED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'PAYOUT_FAILED',
          title: 'Withdrawal didn’t go through',
          body: 'Your ₦45,000 withdrawal failed. The full amount has been returned to your available balance.',
        }),
      });
      expect(service.sendEmail).toHaveBeenCalledWith(
        'isaac@example.com',
        'Withdrawal didn’t go through',
        expect.stringContaining('Amount restored'),
      );
    });

    it('sends the delayed notice with the support hint', async () => {
      allowAll();

      await service.dispatchPayoutNotification(payoutEvent, 'DELAYED');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'PAYOUT_DELAYED',
          title: 'Payout is taking longer than usual',
          body: 'Your ₦44,950 transfer is awaiting confirmation from your bank. There’s no need to submit it again.',
        }),
      });
      expect(service.sendEmail).toHaveBeenCalledWith(
        'isaac@example.com',
        'Payout is taking longer than usual',
        expect.stringContaining('contact support with the reference below'),
      );
    });
  });

  describe('dispatchContributionNotification', () => {
    const contributionEvent: ContributionNotificationEvent = {
      supportId: 'sup-1',
      creatorUserId: 'user-1',
      supporterName: 'Chidi',
      yards: 3,
      materialName: 'Silk Cashmere',
      amount: 1500000, // 15,000 NGN
      message: 'Keep making wonderful designs!',
    };

    it('creates in-app contribution notification with yards and fabric info', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        inAppOnContribution: true,
        emailOnContribution: true,
      });

      await service.dispatchContributionNotification(contributionEvent);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          category: 'CONTRIBUTION',
          type: 'CONTRIBUTION_RECEIVED',
          title: 'New contribution received!',
          body: expect.stringContaining(
            'Chidi bought 3 yards of Silk Cashmere (₦15,000)',
          ),
          actionUrl: '/dashboard/contributions',
        }),
      });
      expect(service.sendEmail).toHaveBeenCalledWith(
        'ada@example.com',
        expect.stringContaining('Chidi just supported you with 3 yards!'),
        expect.stringContaining('Keep making wonderful designs!'),
      );
    });
  });

  describe('dispatchSecurityAlertNotification', () => {
    const secEvent: NewDeviceLoginEvent = {
      userId: 'user-1',
      email: 'ada@example.com',
      deviceLabel: 'Chrome on macOS',
      location: 'Lagos, Nigeria',
      ipAddress: '102.89.23.45',
      sessionId: 'sess-new',
    };

    it('creates security in-app notification and sends transactional security email', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'user-1',
        inAppOnSecurity: true,
        emailOnSecurity: true,
      });

      await service.dispatchSecurityAlertNotification(secEvent);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          category: 'SECURITY',
          type: 'NEW_DEVICE_LOGIN',
          title: 'New sign-in detected',
          actionUrl: '/settings/security',
        }),
      });
      expect(service.sendEmail).toHaveBeenCalledWith(
        'ada@example.com',
        expect.stringContaining('New sign-in detected'),
        expect.stringContaining('Chrome on macOS'),
      );
    });
  });

  describe('dispatchKycNotification', () => {
    it('sends verified email to creator on status VERIFIED', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      });

      const kycEvent: KycNotificationEvent = {
        creatorUserId: 'user-1',
        status: 'VERIFIED',
      };

      await service.dispatchKycNotification(kycEvent);

      expect(service.sendEmail).toHaveBeenCalledWith(
        'ada@example.com',
        expect.stringContaining('Identity Verified'),
        expect.stringContaining("You're verified!"),
      );
    });
  });
});
