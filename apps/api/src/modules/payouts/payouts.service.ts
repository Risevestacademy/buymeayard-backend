import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  AccountType,
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
    if (amount <= 0) {
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

    if (creator.kycStatus !== 'VERIFIED') {
      throw new BadRequestException({
        code: ErrorCodes.KYC_REQUIRED,
        message: 'KYC verification is required before payouts can be requested',
      });
    }

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
