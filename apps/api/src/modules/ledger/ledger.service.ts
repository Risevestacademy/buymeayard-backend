import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AccountType,
  LedgerDirection,
  LedgerEntryType,
} from '@buymeayard/types';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensures an account exists for an owner (Creator or Platform) and currency
   */
  async getOrCreateAccount(
    ownerType: AccountType,
    ownerId: string,
    currency = 'NGN',
  ) {
    let account = await this.prisma.account.findFirst({
      where: {
        ownerType,
        ownerId,
        currency,
      },
    });

    if (!account) {
      account = await this.prisma.account.create({
        data: {
          ownerType,
          ownerId,
          currency,
          status: 'ACTIVE',
        },
      });
    }

    return account;
  }

  /**
   * Records ledger entries for a completed support payment
   */
  async recordSupportPayment(
    transactionId: string,
    creatorId: string,
    creatorAmount: number | bigint,
    platformFee: number | bigint,
    currency = 'NGN',
  ) {
    const creatorAccount = await this.getOrCreateAccount(
      AccountType.CREATOR,
      creatorId,
      currency,
    );
    const platformAccount = await this.getOrCreateAccount(
      AccountType.PLATFORM,
      'PLATFORM',
      currency,
    );

    return this.prisma.$transaction(async (tx) => {
      // 1. Credit Creator Account
      await tx.ledgerEntry.create({
        data: {
          accountId: creatorAccount.id,
          transactionId,
          entryType: LedgerEntryType.SUPPORT_PAYMENT,
          direction: LedgerDirection.CREDIT,
          amount: BigInt(creatorAmount),
          currency,
          reference: `SUPPORT_${transactionId}`,
        },
      });

      // 2. Credit Platform Account
      await tx.ledgerEntry.create({
        data: {
          accountId: platformAccount.id,
          transactionId,
          entryType: LedgerEntryType.PLATFORM_FEE,
          direction: LedgerDirection.CREDIT,
          amount: BigInt(platformFee),
          currency,
          reference: `FEE_${transactionId}`,
        },
      });
    });
  }

  /**
   * Computes available balance for an account from immutable ledger entries
   */
  async getAccountBalance(accountId: string): Promise<number> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountId },
    });

    return entries.reduce((acc, entry) => {
      const entryAmt = Number(entry.amount);
      if (entry.direction === LedgerDirection.CREDIT) {
        return acc + entryAmt;
      } else {
        return acc - entryAmt;
      }
    }, 0);
  }

  /**
   * Reverses a failed payout reservation by crediting back the creator account
   */
  async recordPayoutReversal(
    payoutId: string,
    accountId: string,
    amount: number | bigint,
    currency = 'NGN',
    reason?: string,
  ) {
    return this.prisma.ledgerEntry.create({
      data: {
        accountId,
        transactionId: payoutId,
        entryType: LedgerEntryType.PAYOUT_REVERSED,
        direction: LedgerDirection.CREDIT,
        amount: BigInt(amount),
        currency,
        reference: `PAYOUT_REVERSED_${payoutId}`,
        metadata: reason ? { reason } : undefined,
      },
    });
  }

  /**
   * Computes 3-tier balance breakdown (available, pending, withdrawn) for a creator
   */
  async getDetailedBalance(creatorId: string, currency = 'NGN') {
    const account = await this.getOrCreateAccount(
      AccountType.CREATOR,
      creatorId,
      currency,
    );

    const availableBalance = await this.getAccountBalance(account.id);

    // Sum pending/requested payouts
    const pendingPayouts = await this.prisma.payout.aggregate({
      where: {
        creatorId,
        status: {
          in: ['REQUESTED', 'PENDING', 'PROCESSING'],
        },
      },
      _sum: { amount: true },
    });

    // Sum successfully completed payouts
    const completedPayouts = await this.prisma.payout.aggregate({
      where: {
        creatorId,
        status: 'SUCCESS',
      },
      _sum: { amount: true },
    });

    return {
      availableBalance,
      pendingBalance: pendingPayouts._sum.amount
        ? Number(pendingPayouts._sum.amount)
        : 0,
      withdrawnBalance: completedPayouts._sum.amount
        ? Number(completedPayouts._sum.amount)
        : 0,
      currency,
    };
  }
}
