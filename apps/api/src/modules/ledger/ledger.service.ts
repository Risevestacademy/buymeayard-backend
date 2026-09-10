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
    creatorAmount: number,
    platformFee: number,
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
          amount: creatorAmount,
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
          amount: platformFee,
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
      if (entry.direction === LedgerDirection.CREDIT) {
        return acc + entry.amount;
      } else {
        return acc - entry.amount;
      }
    }, 0);
  }
}
