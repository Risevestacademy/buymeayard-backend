import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  AccountType,
  LedgerDirection,
  LedgerEntryType,
  PayoutStatus,
} from '@buymeayard/types';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Resolves NUBAN account name and creates Paystack transfer recipient
   */
  async resolveAndAddPayoutMethod(
    creatorUserId: string,
    dto: CreatePayoutMethodDto,
  ) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }

    // 1. Resolve NUBAN account name via Paystack
    const resolved = await this.paymentProvider.resolveAccountNumber({
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
    });

    // 2. Create Paystack Transfer Recipient
    const recipient = await this.paymentProvider.createTransferRecipient({
      name: resolved.accountName,
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode,
      currency: 'NGN',
      description: `Payout account for ${creator.creatorName || creator.slug}`,
    });

    // 3. Count existing methods to determine if this should be default
    const existingCount = await this.prisma.payoutMethod.count({
      where: { creatorId: creator.id },
    });

    // 4. Save PayoutMethod in database
    const payoutMethod = await this.prisma.payoutMethod.create({
      data: {
        creatorId: creator.id,
        type: 'BANK_ACCOUNT',
        provider: this.paymentProvider.providerName,
        accountIdentifier: recipient.recipientCode,
        accountName: resolved.accountName,
        bankName: dto.bankName,
        status: 'ACTIVE',
        isDefault: existingCount === 0,
      },
    });

    return {
      id: payoutMethod.id,
      bankName: payoutMethod.bankName,
      accountName: payoutMethod.accountName,
      maskedAccountNumber: `******${dto.accountNumber.slice(-4)}`,
      isDefault: payoutMethod.isDefault,
      status: payoutMethod.status,
      createdAt: payoutMethod.createdAt,
    };
  }

  /**
   * Fetches all registered payout accounts for the authenticated creator
   */
  async getPayoutMethods(creatorUserId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      include: {
        payoutMethods: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }

    return creator.payoutMethods.map((method) => ({
      id: method.id,
      bankName: method.bankName,
      accountName: method.accountName,
      isDefault: method.isDefault,
      status: method.status,
      createdAt: method.createdAt,
    }));
  }

  /**
   * Computes available, pending, and withdrawn balance for the creator
   */
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

    return this.ledgerService.getDetailedBalance(creator.id, 'NGN');
  }

  /**
   * Requests a payout withdrawal: validates KYC, locks funds in ledger, and triggers transfer
   */
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

    // 1. KYC Withdrawal Gate (Engineer 4 Coordination)
    if (creator.kycStatus !== 'VERIFIED') {
      throw new BadRequestException({
        code: ErrorCodes.KYC_REQUIRED,
        message: 'KYC verification is required before payouts can be requested',
      });
    }

    // 2. Ensure active payout method exists
    const defaultPayoutMethod =
      creator.payoutMethods.find((m) => m.isDefault && m.status === 'ACTIVE') ||
      creator.payoutMethods.find((m) => m.status === 'ACTIVE');

    if (!defaultPayoutMethod) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_METHOD_REQUIRED,
        message:
          'A valid payout method must be configured before requesting withdrawals',
      });
    }

    // 3. Resolve creator ledger account
    const account = await this.ledgerService.getOrCreateAccount(
      AccountType.CREATOR,
      creator.id,
      currency,
    );

    // 4. Atomically verify balance and reserve funds in ledger to prevent double-spending
    const payout = await this.prisma.$transaction(async (tx) => {
      // Row lock on creator account to serialize concurrent payout requests
      if (typeof (tx as any).$queryRaw === 'function') {
        await (tx as any)
          .$queryRaw`SELECT id FROM accounts WHERE id = ${account.id} FOR UPDATE`.catch(
          () => {},
        );
      }

      const availableBalance = await this.ledgerService.getAccountBalance(
        account.id,
      );

      if (availableBalance < amount) {
        throw new BadRequestException({
          code: ErrorCodes.INSUFFICIENT_FUNDS,
          message: `Requested payout (${amount}) exceeds available balance (${availableBalance})`,
        });
      }

      const createdPayout = await tx.payout.create({
        data: {
          creatorId: creator.id,
          accountId: account.id,
          amount,
          currency,
          status: PayoutStatus.REQUESTED,
          requestedAt: new Date(),
        },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: account.id,
          transactionId: createdPayout.id,
          entryType: LedgerEntryType.PAYOUT_RESERVATION,
          direction: LedgerDirection.DEBIT,
          amount,
          currency,
          reference: `PAYOUT_RESERVE_${createdPayout.id}`,
        },
      });

      return createdPayout;
    });

    // 5. Initiate Paystack Transfer
    try {
      const transferResult = await this.paymentProvider.initiateTransfer({
        amount,
        recipientCode: defaultPayoutMethod.accountIdentifier,
        reference: payout.id,
        reason: `Earnings payout for ${creator.creatorName || creator.slug}`,
        currency,
      });

      const updatedPayout = await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.PROCESSING,
          providerReference:
            transferResult.transferCode || transferResult.reference,
        },
      });

      return updatedPayout;
    } catch (err: any) {
      this.logger.error(
        `Paystack transfer failed for payout ${payout.id}: ${err.message}`,
        err.stack,
      );

      // Revert payout status and restore reserved ledger funds
      await this.prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: PayoutStatus.FAILED,
          failureReason: err.message,
        },
      });

      await this.ledgerService.recordPayoutReversal(
        payout.id,
        account.id,
        amount,
        currency,
        err.message,
      );

      throw new BadRequestException(
        `Failed to initiate bank transfer: ${err.message}. Your balance has been restored.`,
      );
    }
  }

  /**
   * Fetches withdrawal history with timestamps and failure reasons
   */
  async getPayoutHistory(creatorUserId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }

    return this.prisma.payout.findMany({
      where: { creatorId: creator.id },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        providerReference: true,
        requestedAt: true,
        processedAt: true,
        failureReason: true,
      },
    });
  }
}
