import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  AccountType,
  CreatorStatus,
  KycStatus,
  LedgerDirection,
  LedgerEntryType,
  PayoutStatus,
} from '@buymeayard/types';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
  ) {}

  async requestPayout(creatorUserId: string, amount: number, currency = 'NGN') {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_AMOUNT,
        message: 'Payout amount must be greater than 0',
      });
    }

    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      include: { payoutMethods: true },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }

    this.assertCanWithdraw(creator);

    const defaultPayoutMethod =
      creator.payoutMethods.find((m) => m.isDefault) ||
      creator.payoutMethods[0];
    if (!defaultPayoutMethod) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_METHOD_REQUIRED,
        message: 'A valid payout method must be configured',
      });
    }

    const account = await this.ledgerService.getOrCreateAccount(
      AccountType.CREATOR,
      creator.id,
      currency,
    );
    const balance = await this.ledgerService.getAccountBalance(account.id);

    if (balance < amount) {
      throw new BadRequestException({
        code: ErrorCodes.INSUFFICIENT_FUNDS,
        message: `Requested payout (${amount}) exceeds available balance (${balance})`,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      // Serialize payouts per creator and re-check under the lock: the
      // creator may have been revoked/suspended, or a concurrent payout may
      // have reserved funds, since the checks above.
      await tx.$queryRaw`SELECT id FROM "creator_profiles" WHERE id = ${creator.id} FOR UPDATE`;
      const locked = await tx.creatorProfile.findUniqueOrThrow({
        where: { id: creator.id },
        select: { status: true, kycStatus: true },
      });
      this.assertCanWithdraw(locked);

      const entries = await tx.ledgerEntry.findMany({
        where: { accountId: account.id },
        select: { direction: true, amount: true },
      });
      const lockedBalance = entries.reduce(
        (sum, e) =>
          e.direction === LedgerDirection.CREDIT
            ? sum + e.amount
            : sum - e.amount,
        0,
      );
      if (lockedBalance < amount) {
        throw new BadRequestException({
          code: ErrorCodes.INSUFFICIENT_FUNDS,
          message: `Requested payout (${amount}) exceeds available balance (${lockedBalance})`,
        });
      }

      // 1. Create payout record
      const payout = await tx.payout.create({
        data: {
          creatorId: creator.id,
          accountId: account.id,
          amount,
          currency,
          status: PayoutStatus.REQUESTED,
          requestedAt: new Date(),
        },
      });

      // 2. Reserve funds immediately in ledger to prevent double-spending
      await tx.ledgerEntry.create({
        data: {
          accountId: account.id,
          transactionId: payout.id,
          entryType: LedgerEntryType.PAYOUT_RESERVATION,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
          reference: `PAYOUT_RESERVE_${payout.id}`,
        },
      });

      return payout;
    });
  }

  /** Withdrawals need a verified identity and a creator in good standing. */
  private assertCanWithdraw(creator: { status: string; kycStatus: string }) {
    if (creator.kycStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException({
        code: ErrorCodes.KYC_REQUIRED,
        message: 'KYC verification is required before payouts can be requested',
      });
    }
    if (creator.status !== CreatorStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCodes.CREATOR_NOT_ACTIVE,
        message: 'Payouts are not available for this account',
      });
    }
  }

  async getCreatorBalance(creatorUserId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
    });
    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }

    const account = await this.ledgerService.getOrCreateAccount(
      AccountType.CREATOR,
      creator.id,
    );
    const availableBalance = await this.ledgerService.getAccountBalance(
      account.id,
    );

    return {
      availableBalance,
      currency: account.currency,
    };
  }
}
