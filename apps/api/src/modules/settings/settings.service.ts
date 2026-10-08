import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { AuthService } from '../auth/auth.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { AccountType, KycStatus } from '@buymeayard/types';
import {
  SettingsAccountResponseDto,
  AccountKycCardDto,
} from './dto/settings-account.dto';
import {
  DeleteAccountDto,
  DeleteAccountResponseDto,
} from './dto/delete-account.dto';
import {
  SettingsSecurityResponseDto,
  SettingsAuthProviderDto,
} from './dto/settings-security.dto';
import {
  SessionsListResponseDto,
  SessionItemDto,
  RevokeSessionsResponseDto,
} from './dto/session-response.dto';
import {
  NotificationPreferencesResponseDto,
  UpdateNotificationPreferencesDto,
} from './dto/settings-notifications.dto';
import {
  parseUserAgent,
  resolveLocationFromIp,
} from '../../common/utils/session-parser.util';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Retrieves aggregate account settings data for web and mobile.
   */
  async getAccountSettings(userId: string): Promise<SettingsAccountResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        creatorProfile: {
          include: {
            kycSubmissions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    const creator = user.creatorProfile;
    const isLegalNameVerified = creator?.kycStatus === KycStatus.VERIFIED;

    let creatorDto = null;

    if (creator) {
      const latestKycSubmission = creator.kycSubmissions?.[0] || null;
      const kycCard = this.buildKycCard(creator, latestKycSubmission);

      creatorDto = {
        id: creator.id,
        slug: creator.slug,
        vanityUrl: `buymeayard.com/${creator.slug}`,
        isPublished: creator.isPublished,
        kycStatus: creator.kycStatus,
        kycVerifiedAt: creator.kycVerifiedAt,
        kycBlockedReason: creator.kycBlockedReason,
        kycCard,
      };
    }

    return {
      user: {
        id: user.id,
        legalName: user.name || '',
        isLegalNameVerified,
        email: user.email,
        isEmailVerified: user.emailVerified,
        avatarUrl: creator?.avatarUrl || user.image || null,
        status: user.status,
      },
      creator: creatorDto,
    };
  }

  /**
   * Resolves the 4-state KYC presentation card from the creator's KYC status and submission history.
   */
  private buildKycCard(
    creator: {
      kycStatus: string;
      kycVerifiedAt: Date | null;
      kycBlockedReason: string | null;
    },
    latestSubmission: { status: string; rejectionReason?: string | null } | null,
  ): AccountKycCardDto {
    const status = creator.kycStatus;

    if (status === KycStatus.VERIFIED) {
      const verifiedDateStr = creator.kycVerifiedAt
        ? new Date(creator.kycVerifiedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'recently';

      return {
        state: 'VERIFIED',
        badgeLabel: 'Verified',
        badgeVariant: 'success',
        title: 'Identity verified',
        description: `You're verified and can withdraw your earnings. Verified on ${verifiedDateStr}.`,
        ctaLabel: null,
        ctaAction: null,
      };
    }

    if (
      status === 'PENDING' ||
      status === 'NEEDS_REVIEW' ||
      latestSubmission?.status === 'IN_PROGRESS' ||
      latestSubmission?.status === 'NEEDS_REVIEW'
    ) {
      return {
        state: 'PENDING',
        badgeLabel: 'In review',
        badgeVariant: 'warning',
        title: 'Identity verification in review',
        description:
          "We're reviewing your documents. This usually takes under 5 minutes.",
        ctaLabel: null,
        ctaAction: null,
      };
    }

    if (
      status === 'REJECTED' ||
      latestSubmission?.status === 'REJECTED' ||
      latestSubmission?.status === 'RESUBMISSION_REQUIRED'
    ) {
      const reason =
        latestSubmission?.rejectionReason ||
        creator.kycBlockedReason ||
        'Your document could not be verified. Please try again with a valid ID.';

      return {
        state: 'NEEDS_ATTENTION',
        badgeLabel: 'Action required',
        badgeVariant: 'danger',
        title: 'Verification needs attention',
        description: reason,
        ctaLabel: 'Try again',
        ctaAction: 'RETRY_KYC',
      };
    }

    // Default: NOT_SUBMITTED
    return {
      state: 'NOT_SUBMITTED',
      badgeLabel: 'Not verified',
      badgeVariant: 'neutral',
      title: 'Identity verification',
      description:
        'Verify your identity to withdraw earnings from your supporters.',
      ctaLabel: 'Verify identity',
      ctaAction: 'START_KYC',
    };
  }

  /**
   * Safely deletes/deactivates an account after verifying zero pending balances,
   * unpublishes creator page, and purges all active sessions.
   */
  async deleteAccount(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<DeleteAccountResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: true,
        creatorProfile: {
          include: {
            payouts: {
              where: {
                status: { in: ['REQUESTED', 'PENDING', 'PROCESSING'] },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    if (user.status === 'DEACTIVATED') {
      return {
        success: true,
        message: 'Account has already been deactivated.',
      };
    }

    // Guard 1: In-flight withdrawals
    if (user.creatorProfile?.payouts && user.creatorProfile.payouts.length > 0) {
      throw new BadRequestException({
        code: ErrorCodes.PENDING_PAYOUTS_EXIST,
        message:
          'You have pending withdrawals in progress. Please wait for them to settle before deleting your account.',
      });
    }

    // Guard 2: Available balance in ledger
    if (user.creatorProfile) {
      const account = await this.ledgerService.getOrCreateAccount(
        AccountType.CREATOR,
        user.creatorProfile.id,
      );
      const balance = await this.ledgerService.getAccountBalance(account.id);
      if (balance > 0) {
        const formattedAmount = (balance / 100).toLocaleString();
        throw new BadRequestException({
          code: ErrorCodes.BALANCE_NOT_ZERO,
          message: `You have an unwithdrawn balance of ₦${formattedAmount}. Please withdraw all funds before deleting your account.`,
        });
      }
    }

    // Guard 3: Password verification (if user has credential password)
    const credentialAccount = user.accounts.find(
      (a) => a.providerId === 'credential',
    );
    if (credentialAccount?.password) {
      if (!dto.password) {
        throw new BadRequestException({
          code: ErrorCodes.PASSWORD_REQUIRED,
          message: 'Please enter your password to confirm account deletion.',
        });
      }

      const verifyRes = await this.authService.signInEmail({
        email: user.email,
        password: dto.password,
      });

      if (!verifyRes.ok) {
        throw new BadRequestException({
          code: ErrorCodes.PASSWORD_MISMATCH,
          message: 'Incorrect password. Please try again.',
        });
      }
    }

    // Execute atomic deactivation and purge sessions
    await this.prisma.$transaction(async (tx) => {
      // 1. Mark User DEACTIVATED
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DEACTIVATED' },
      });

      // 2. Mark CreatorProfile DEACTIVATED and unpublish
      if (user.creatorProfile) {
        await tx.creatorProfile.update({
          where: { id: user.creatorProfile.id },
          data: {
            status: 'DEACTIVATED',
            isPublished: false,
          },
        });
      }

      // 3. Purge all sessions for this user
      await tx.session.deleteMany({
        where: { userId },
      });
    });

    return {
      success: true,
      message: 'Your account has been deactivated and deleted successfully.',
    };
  }

  /**
   * Retrieves authentication providers, password status, and disconnect guards.
   */
  async getSecuritySettings(userId: string): Promise<SettingsSecurityResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    const credentialAccount = user.accounts.find(
      (a) => a.providerId === 'credential',
    );
    const hasPassword = Boolean(credentialAccount?.password);
    const passwordLastChangedAt = hasPassword
      ? credentialAccount!.updatedAt
      : null;

    const googleAccount = user.accounts.find((a) => a.providerId === 'google');
    const googleConnected = Boolean(googleAccount);

    const appleAccount = user.accounts.find((a) => a.providerId === 'apple');
    const appleConnected = Boolean(appleAccount);

    let activeMethodsCount = 0;
    if (hasPassword) activeMethodsCount++;
    if (googleConnected) activeMethodsCount++;
    if (appleConnected) activeMethodsCount++;

    const providers: SettingsAuthProviderDto[] = [
      {
        providerId: 'credential',
        name: 'Email & Password',
        connected: hasPassword,
        email: user.email,
        canDisconnect: false,
      },
      {
        providerId: 'google',
        name: 'Google',
        connected: googleConnected,
        email: googleConnected ? user.email : null,
        canDisconnect: googleConnected && activeMethodsCount > 1,
      },
      {
        providerId: 'apple',
        name: 'Apple',
        connected: appleConnected,
        email: appleConnected ? user.email : null,
        canDisconnect: appleConnected && activeMethodsCount > 1,
      },
    ];

    return {
      hasPassword,
      passwordLastChangedAt,
      providers,
    };
  }

  /**
   * Disconnects a social authentication provider while ensuring the user retains
   * at least one login method.
   */
  async disconnectProvider(
    userId: string,
    providerId: string,
  ): Promise<{ success: boolean; message: string }> {
    if (providerId !== 'google' && providerId !== 'apple') {
      throw new BadRequestException({
        code: ErrorCodes.BAD_REQUEST,
        message: 'Only social providers (Google, Apple) can be disconnected.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    const targetAccount = user.accounts.find(
      (a) => a.providerId === providerId,
    );
    if (!targetAccount) {
      throw new NotFoundException({
        code: ErrorCodes.PROVIDER_NOT_CONNECTED,
        message: `${providerId} is not connected to this account.`,
      });
    }

    const hasPassword = user.accounts.some(
      (a) => a.providerId === 'credential' && Boolean(a.password),
    );
    const connectedSocialCount = user.accounts.filter(
      (a) => a.providerId === 'google' || a.providerId === 'apple',
    ).length;

    const totalActiveMethods = (hasPassword ? 1 : 0) + connectedSocialCount;

    if (totalActiveMethods <= 1) {
      throw new BadRequestException({
        code: ErrorCodes.CANNOT_DISCONNECT_SOLE_METHOD,
        message:
          'You cannot disconnect your only sign-in method. Please set up a password or another login method first.',
      });
    }

    await this.prisma.authAccount.delete({
      where: { id: targetAccount.id },
    });

    return {
      success: true,
      message: `${providerId} account has been disconnected successfully.`,
    };
  }

  /**
   * Lists all active sessions with parsed device, OS, location, and isCurrent badge.
   */
  async listSessions(
    userId: string,
    currentSessionToken?: string,
  ): Promise<SessionsListResponseDto> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const mappedSessions: SessionItemDto[] = sessions.map((s) => {
      const parsedClient = parseUserAgent(s.userAgent);
      const location = resolveLocationFromIp(s.ipAddress);
      const isCurrent = Boolean(
        currentSessionToken && s.token === currentSessionToken,
      );

      return {
        id: s.id,
        deviceType: parsedClient.deviceType,
        browser: parsedClient.browser,
        os: parsedClient.os,
        deviceLabel: parsedClient.deviceLabel,
        ipAddress: s.ipAddress,
        location,
        isCurrent,
        lastActiveAt: s.updatedAt,
        createdAt: s.createdAt,
      };
    });

    // Sort so current session appears first
    mappedSessions.sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));

    return {
      sessions: mappedSessions,
    };
  }

  /**
   * Revokes a specific remote session. Rejects if user targets their current active session.
   */
  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionToken?: string,
  ): Promise<{ success: boolean; message: string }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCodes.SESSION_NOT_FOUND,
        message: 'Session not found.',
      });
    }

    if (currentSessionToken && session.token === currentSessionToken) {
      throw new BadRequestException({
        code: ErrorCodes.CANNOT_REVOKE_CURRENT_SESSION,
        message:
          'You cannot revoke your current active session from here. Please use sign-out instead.',
      });
    }

    await this.prisma.session.delete({
      where: { id: sessionId },
    });

    return {
      success: true,
      message: 'Device has been signed out successfully.',
    };
  }

  /**
   * Revokes all sessions belonging to the user except the active one making this request.
   */
  async revokeOtherSessions(
    userId: string,
    currentSessionId?: string,
    currentSessionToken?: string,
  ): Promise<RevokeSessionsResponseDto> {
    let resolvedCurrentId = currentSessionId;

    if (!resolvedCurrentId && currentSessionToken) {
      const current = await this.prisma.session.findUnique({
        where: { token: currentSessionToken },
        select: { id: true },
      });
      resolvedCurrentId = current?.id;
    }

    const deleteResult = await this.prisma.session.deleteMany({
      where: {
        userId,
        ...(resolvedCurrentId ? { id: { not: resolvedCurrentId } } : {}),
      },
    });

    return {
      success: true,
      revokedCount: deleteResult.count,
      message:
        deleteResult.count > 0
          ? `Signed out of ${deleteResult.count} other device${deleteResult.count === 1 ? '' : 's'}.`
          : 'No other active devices found.',
    };
  }

  /**
   * Retrieves notification preferences for the user, auto-creating default settings if none exist.
   */
  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferencesResponseDto> {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: {
          userId,
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
        },
      });
    }

    return {
      emailOnContribution: prefs.emailOnContribution,
      inAppOnContribution: prefs.inAppOnContribution,
      pushOnContribution: prefs.pushOnContribution,
      emailOnPayout: prefs.emailOnPayout,
      inAppOnPayout: prefs.inAppOnPayout,
      pushOnPayout: prefs.pushOnPayout,
      emailOnSecurityAlert: prefs.emailOnSecurityAlert,
      inAppOnSecurityAlert: prefs.inAppOnSecurityAlert,
      pushOnSecurityAlert: prefs.pushOnSecurityAlert,
      emailOnProductUpdates: prefs.emailOnProductUpdates,
      emailOnCreatorTips: prefs.emailOnCreatorTips,
    };
  }

  /**
   * Updates notification preference toggles for the user.
   */
  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    // Ensure default preferences record exists
    await this.getNotificationPreferences(userId);

    const updated = await this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        ...(dto.emailOnContribution !== undefined
          ? { emailOnContribution: dto.emailOnContribution }
          : {}),
        ...(dto.inAppOnContribution !== undefined
          ? { inAppOnContribution: dto.inAppOnContribution }
          : {}),
        ...(dto.pushOnContribution !== undefined
          ? { pushOnContribution: dto.pushOnContribution }
          : {}),
        ...(dto.pushOnPayout !== undefined
          ? { pushOnPayout: dto.pushOnPayout }
          : {}),
        ...(dto.pushOnSecurityAlert !== undefined
          ? { pushOnSecurityAlert: dto.pushOnSecurityAlert }
          : {}),
        ...(dto.emailOnProductUpdates !== undefined
          ? { emailOnProductUpdates: dto.emailOnProductUpdates }
          : {}),
        ...(dto.emailOnCreatorTips !== undefined
          ? { emailOnCreatorTips: dto.emailOnCreatorTips }
          : {}),
      },
    });

    return {
      emailOnContribution: updated.emailOnContribution,
      inAppOnContribution: updated.inAppOnContribution,
      pushOnContribution: updated.pushOnContribution,
      emailOnPayout: updated.emailOnPayout,
      inAppOnPayout: updated.inAppOnPayout,
      pushOnPayout: updated.pushOnPayout,
      emailOnSecurityAlert: updated.emailOnSecurityAlert,
      inAppOnSecurityAlert: updated.inAppOnSecurityAlert,
      pushOnSecurityAlert: updated.pushOnSecurityAlert,
      emailOnProductUpdates: updated.emailOnProductUpdates,
      emailOnCreatorTips: updated.emailOnCreatorTips,
    };
  }
}


