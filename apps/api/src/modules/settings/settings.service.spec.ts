jest.mock('../auth/better-auth', () => ({
  createBetterAuth: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AuthService } from '../auth/auth.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '../../common/errors/error-codes';
import { KycStatus } from '@buymeayard/types';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: any;
  let ledgerService: any;
  let authService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      creatorProfile: {
        update: jest.fn(),
      },
      authAccount: {
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      session: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      notificationPreference: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    ledgerService = {
      getOrCreateAccount: jest.fn().mockResolvedValue({ id: 'acc_123' }),
      getAccountBalance: jest.fn().mockResolvedValue(0),
    };

    authService = {
      signInEmail: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledgerService },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('getAccountSettings', () => {
    it('throws NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getAccountSettings('usr_unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns verified card and badge when creator is KYC verified', async () => {
      const verifiedAt = new Date('2026-03-15T10:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        name: 'David Olaleye',
        email: 'david@example.com',
        emailVerified: true,
        image: null,
        status: 'ACTIVE',
        creatorProfile: {
          id: 'crt_1',
          slug: 'davidyard',
          isPublished: true,
          avatarUrl: 'https://cdn.buymeayard.com/avatar.jpg',
          kycStatus: KycStatus.VERIFIED,
          kycVerifiedAt: verifiedAt,
          kycBlockedReason: null,
          kycSubmissions: [],
        },
      });

      const res = await service.getAccountSettings('usr_1');

      expect(res.user.legalName).toBe('David Olaleye');
      expect(res.user.isLegalNameVerified).toBe(true);
      expect(res.user.isEmailVerified).toBe(true);
      expect(res.creator?.vanityUrl).toBe('buymeayard.com/davidyard');
      expect(res.creator?.kycCard.state).toBe('VERIFIED');
      expect(res.creator?.kycCard.badgeVariant).toBe('success');
      expect(res.creator?.kycCard.ctaLabel).toBeNull();
    });

    it('returns in-review card when KYC is pending', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        name: 'David Olaleye',
        email: 'david@example.com',
        emailVerified: false,
        image: null,
        status: 'ACTIVE',
        creatorProfile: {
          id: 'crt_1',
          slug: 'davidyard',
          isPublished: false,
          kycStatus: 'PENDING',
          kycVerifiedAt: null,
          kycBlockedReason: null,
          kycSubmissions: [{ status: 'IN_PROGRESS' }],
        },
      });

      const res = await service.getAccountSettings('usr_1');

      expect(res.user.isLegalNameVerified).toBe(false);
      expect(res.creator?.kycCard.state).toBe('PENDING');
      expect(res.creator?.kycCard.badgeVariant).toBe('warning');
      expect(res.creator?.kycCard.badgeLabel).toBe('In review');
    });

    it('returns action-required card with reason when KYC is rejected', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        name: 'David Olaleye',
        email: 'david@example.com',
        emailVerified: true,
        image: null,
        status: 'ACTIVE',
        creatorProfile: {
          id: 'crt_1',
          slug: 'davidyard',
          isPublished: false,
          kycStatus: 'REJECTED',
          kycVerifiedAt: null,
          kycBlockedReason: null,
          kycSubmissions: [
            {
              status: 'REJECTED',
              rejectionReason: 'ID was expired. Please provide a valid document.',
            },
          ],
        },
      });

      const res = await service.getAccountSettings('usr_1');

      expect(res.creator?.kycCard.state).toBe('NEEDS_ATTENTION');
      expect(res.creator?.kycCard.badgeVariant).toBe('danger');
      expect(res.creator?.kycCard.description).toBe(
        'ID was expired. Please provide a valid document.',
      );
      expect(res.creator?.kycCard.ctaLabel).toBe('Try again');
    });

    it('returns not-verified card when creator has not submitted KYC', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        name: 'New Creator',
        email: 'new@example.com',
        emailVerified: true,
        image: null,
        status: 'ACTIVE',
        creatorProfile: {
          id: 'crt_1',
          slug: 'newcreator',
          isPublished: false,
          kycStatus: 'NOT_SUBMITTED',
          kycVerifiedAt: null,
          kycBlockedReason: null,
          kycSubmissions: [],
        },
      });

      const res = await service.getAccountSettings('usr_1');

      expect(res.creator?.kycCard.state).toBe('NOT_SUBMITTED');
      expect(res.creator?.kycCard.badgeLabel).toBe('Not verified');
      expect(res.creator?.kycCard.ctaLabel).toBe('Verify identity');
    });
  });

  describe('deleteAccount', () => {
    it('throws NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteAccount('usr_unknown', { password: 'pass' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('blocks deletion when pending in-flight withdrawals exist', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        status: 'ACTIVE',
        accounts: [],
        creatorProfile: {
          id: 'crt_1',
          payouts: [{ id: 'po_1', status: 'PROCESSING' }],
        },
      });

      await expect(service.deleteAccount('usr_1', {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAccount('usr_1', {})).rejects.toMatchObject({
        response: { code: ErrorCodes.PENDING_PAYOUTS_EXIST },
      });
    });

    it('blocks deletion when user has non-zero available balance', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        status: 'ACTIVE',
        accounts: [],
        creatorProfile: {
          id: 'crt_1',
          payouts: [],
        },
      });
      ledgerService.getAccountBalance.mockResolvedValue(50000); // ₦500

      await expect(service.deleteAccount('usr_1', {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAccount('usr_1', {})).rejects.toMatchObject({
        response: { code: ErrorCodes.BALANCE_NOT_ZERO },
      });
    });

    it('blocks deletion when password is required but not provided', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        status: 'ACTIVE',
        accounts: [{ providerId: 'credential', password: 'hashed_password' }],
        creatorProfile: {
          id: 'crt_1',
          payouts: [],
        },
      });
      ledgerService.getAccountBalance.mockResolvedValue(0);

      await expect(service.deleteAccount('usr_1', {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.deleteAccount('usr_1', {})).rejects.toMatchObject({
        response: { code: ErrorCodes.PASSWORD_REQUIRED },
      });
    });

    it('blocks deletion when password verification fails', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        status: 'ACTIVE',
        accounts: [{ providerId: 'credential', password: 'hashed_password' }],
        creatorProfile: {
          id: 'crt_1',
          payouts: [],
        },
      });
      ledgerService.getAccountBalance.mockResolvedValue(0);
      authService.signInEmail.mockResolvedValue({ ok: false });

      await expect(
        service.deleteAccount('usr_1', { password: 'wrong_password' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.deleteAccount('usr_1', { password: 'wrong_password' }),
      ).rejects.toMatchObject({
        response: { code: ErrorCodes.PASSWORD_MISMATCH },
      });
    });

    it('successfully deactivates user, unpublishes profile, and clears sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        status: 'ACTIVE',
        accounts: [{ providerId: 'credential', password: 'hashed_password' }],
        creatorProfile: {
          id: 'crt_1',
          payouts: [],
        },
      });
      ledgerService.getAccountBalance.mockResolvedValue(0);
      authService.signInEmail.mockResolvedValue({ ok: true });

      const res = await service.deleteAccount('usr_1', {
        password: 'ValidPassword1!',
        reason: 'Relocating business',
      });

      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'usr_1' },
        data: { status: 'DEACTIVATED' },
      });
      expect(prisma.creatorProfile.update).toHaveBeenCalledWith({
        where: { id: 'crt_1' },
        data: { status: 'DEACTIVATED', isPublished: false },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'usr_1' },
      });
    });
  });

  describe('getSecuritySettings', () => {
    it('throws NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getSecuritySettings('usr_unknown')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns password status and provider disconnect availability', async () => {
      const updatedAt = new Date('2026-09-01T10:00:00.000Z');
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        accounts: [
          { providerId: 'credential', password: 'hash', updatedAt },
          { providerId: 'google' },
        ],
      });

      const res = await service.getSecuritySettings('usr_1');

      expect(res.hasPassword).toBe(true);
      expect(res.passwordLastChangedAt).toEqual(updatedAt);
      expect(res.providers).toHaveLength(3);

      const googleProvider = res.providers.find((p) => p.providerId === 'google');
      expect(googleProvider?.connected).toBe(true);
      expect(googleProvider?.canDisconnect).toBe(true); // User also has password
    });

    it('blocks disconnect when Google is the only login method', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        email: 'david@example.com',
        accounts: [{ providerId: 'google' }],
      });

      const res = await service.getSecuritySettings('usr_1');

      expect(res.hasPassword).toBe(false);
      expect(res.passwordLastChangedAt).toBeNull();

      const googleProvider = res.providers.find((p) => p.providerId === 'google');
      expect(googleProvider?.connected).toBe(true);
      expect(googleProvider?.canDisconnect).toBe(false); // Only 1 method
    });
  });

  describe('disconnectProvider', () => {
    it('rejects disconnecting non-social providers', async () => {
      await expect(
        service.disconnectProvider('usr_1', 'credential'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if provider is not connected', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        accounts: [{ providerId: 'credential', password: 'hash' }],
      });

      await expect(
        service.disconnectProvider('usr_1', 'google'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects disconnecting provider if it is the sole login method', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        accounts: [{ id: 'acc_g', providerId: 'google' }],
      });

      await expect(
        service.disconnectProvider('usr_1', 'google'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.disconnectProvider('usr_1', 'google'),
      ).rejects.toMatchObject({
        response: { code: ErrorCodes.CANNOT_DISCONNECT_SOLE_METHOD },
      });
    });

    it('successfully unlinks provider if user has another login method', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr_1',
        accounts: [
          { id: 'acc_cred', providerId: 'credential', password: 'hash' },
          { id: 'acc_g', providerId: 'google' },
        ],
      });

      const res = await service.disconnectProvider('usr_1', 'google');

      expect(res.success).toBe(true);
      expect(prisma.authAccount.delete).toHaveBeenCalledWith({
        where: { id: 'acc_g' },
      });
    });
  });

  describe('listSessions', () => {
    it('returns parsed sessions and identifies current device', async () => {
      prisma.session.findMany.mockResolvedValue([
        {
          id: 'sess_1',
          token: 'token_other',
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1',
          ipAddress: '102.89.23.4',
          updatedAt: new Date('2026-10-07T10:00:00Z'),
          createdAt: new Date('2026-10-07T10:00:00Z'),
        },
        {
          id: 'sess_2',
          token: 'token_current',
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/128.0.0.0 Safari/537.36',
          ipAddress: '127.0.0.1',
          updatedAt: new Date('2026-10-08T12:00:00Z'),
          createdAt: new Date('2026-10-08T12:00:00Z'),
        },
      ]);

      const res = await service.listSessions('usr_1', 'token_current');

      expect(res.sessions).toHaveLength(2);
      // sess_2 should be first because it is the current device
      expect(res.sessions[0].id).toBe('sess_2');
      expect(res.sessions[0].isCurrent).toBe(true);
      expect(res.sessions[0].deviceLabel).toBe('Chrome on macOS');
      expect(res.sessions[0].location).toBe('Local Network');

      expect(res.sessions[1].id).toBe('sess_1');
      expect(res.sessions[1].isCurrent).toBe(false);
      expect(res.sessions[1].deviceLabel).toBe('Safari on iOS');
      expect(res.sessions[1].location).toBe('Lagos, Nigeria');
    });
  });

  describe('revokeSession', () => {
    it('throws NotFoundException if session does not exist or belongs to another user', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      await expect(
        service.revokeSession('usr_1', 'sess_other'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects revoking current session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: 'usr_1',
        token: 'token_active',
      });

      await expect(
        service.revokeSession('usr_1', 'sess_1', 'token_active'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.revokeSession('usr_1', 'sess_1', 'token_active'),
      ).rejects.toMatchObject({
        response: { code: ErrorCodes.CANNOT_REVOKE_CURRENT_SESSION },
      });
    });

    it('successfully revokes remote session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'sess_2',
        userId: 'usr_1',
        token: 'token_remote',
      });

      const res = await service.revokeSession(
        'usr_1',
        'sess_2',
        'token_current',
      );

      expect(res.success).toBe(true);
      expect(prisma.session.delete).toHaveBeenCalledWith({
        where: { id: 'sess_2' },
      });
    });
  });

  describe('revokeOtherSessions', () => {
    it('deletes all sessions except the current active session', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 3 });

      const res = await service.revokeOtherSessions(
        'usr_1',
        'sess_current',
        'token_current',
      );

      expect(res.success).toBe(true);
      expect(res.revokedCount).toBe(3);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'usr_1',
          id: { not: 'sess_current' },
        },
      });
    });
  });

  describe('getNotificationPreferences', () => {
    it('creates default preferences if none exist for user', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue(null);
      prisma.notificationPreference.create.mockResolvedValue({
        userId: 'usr_1',
        emailOnContribution: true,
        inAppOnContribution: true,
        pushOnContribution: true,
        emailOnPayout: true,
        inAppOnPayout: true,
        pushOnPayout: true,
        emailOnSecurityAlert: true,
        inAppOnSecurityAlert: true,
        pushOnSecurityAlert: true,
        emailOnProductUpdates: false,
        emailOnCreatorTips: false,
      });

      const res = await service.getNotificationPreferences('usr_1');

      expect(prisma.notificationPreference.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'usr_1',
          emailOnContribution: true,
          emailOnProductUpdates: false,
        }),
      });
      expect(res.emailOnContribution).toBe(true);
      expect(res.emailOnProductUpdates).toBe(false);
    });

    it('returns existing preferences', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'usr_1',
        emailOnContribution: false,
        inAppOnContribution: true,
        pushOnContribution: true,
        emailOnPayout: true,
        inAppOnPayout: true,
        pushOnPayout: true,
        emailOnSecurityAlert: true,
        inAppOnSecurityAlert: true,
        pushOnSecurityAlert: true,
        emailOnProductUpdates: true,
        emailOnCreatorTips: false,
      });

      const res = await service.getNotificationPreferences('usr_1');

      expect(res.emailOnContribution).toBe(false);
      expect(res.emailOnProductUpdates).toBe(true);
    });
  });

  describe('updateNotificationPreferences', () => {
    it('updates specified notification preference toggles', async () => {
      prisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 'usr_1',
        emailOnContribution: true,
        inAppOnContribution: true,
        pushOnContribution: true,
        emailOnPayout: true,
        inAppOnPayout: true,
        pushOnPayout: true,
        emailOnSecurityAlert: true,
        inAppOnSecurityAlert: true,
        pushOnSecurityAlert: true,
        emailOnProductUpdates: false,
        emailOnCreatorTips: false,
      });

      prisma.notificationPreference.update.mockResolvedValue({
        userId: 'usr_1',
        emailOnContribution: false,
        inAppOnContribution: true,
        pushOnContribution: true,
        emailOnPayout: true,
        inAppOnPayout: true,
        pushOnPayout: true,
        emailOnSecurityAlert: true,
        inAppOnSecurityAlert: true,
        pushOnSecurityAlert: true,
        emailOnProductUpdates: true,
        emailOnCreatorTips: false,
      });

      const res = await service.updateNotificationPreferences('usr_1', {
        emailOnContribution: false,
        emailOnProductUpdates: true,
      });

      expect(prisma.notificationPreference.update).toHaveBeenCalledWith({
        where: { userId: 'usr_1' },
        data: expect.objectContaining({
          emailOnContribution: false,
          emailOnProductUpdates: true,
        }),
      });
      expect(res.emailOnContribution).toBe(false);
      expect(res.emailOnProductUpdates).toBe(true);
    });
  });
});
