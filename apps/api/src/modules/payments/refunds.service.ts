import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Refund } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProviderRejectedError,
} from '../../infrastructure/payments/payment-provider.interface';
import type {
  PaymentProvider,
  RefundResult,
} from '../../infrastructure/payments/payment-provider.interface';
import { LedgerService } from '../ledger/ledger.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  AccountType,
  LedgerDirection,
  LedgerEntryType,
  PaymentStatus,
  SupportStatus,
} from '@buymeayard/types';

export const OPEN_REFUND_STATUSES = ['PENDING', 'PROCESSING'];
const ACTIVE_REFUND_STATUSES = [...OPEN_REFUND_STATUSES, 'PROCESSED'];

export interface InitiateRefundOptions {
  adminId: string;
  reason: string;
  /** Refund even if the creator has already withdrawn the money. */
  allowNegativeBalance?: boolean;
}

/**
 * Full refunds of a paid contribution, sent to Paystack. The money is taken
 * back from the creator and the platform fee in the ledger first (like a payout
 * reservation) and returned if Paystack fails the refund.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  async initiateRefund(
    supportId: string,
    options: InitiateRefundOptions,
  ): Promise<Refund> {
    const support = await this.prisma.support.findUnique({
      where: { id: supportId },
      include: { payment: true },
    });
    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Contribution not found',
      });
    }

    const payment = support.payment;
    if (
      !payment ||
      payment.status !== PaymentStatus.SUCCESS ||
      ![SupportStatus.PAID, SupportStatus.COMPLETED].includes(
        support.status as SupportStatus,
      )
    ) {
      throw new BadRequestException({
        code: ErrorCodes.REFUND_NOT_ALLOWED,
        message: 'Only a paid contribution can be refunded',
      });
    }

    const creatorAccount = await this.ledgerService.getOrCreateAccount(
      AccountType.CREATOR,
      support.creatorId,
      payment.currency,
    );
    const platformAccount = await this.ledgerService.getOrCreateAccount(
      AccountType.PLATFORM,
      'PLATFORM',
      payment.currency,
    );

    if (!options.allowNegativeBalance) {
      const balance = await this.ledgerService.getAccountBalance(
        creatorAccount.id,
      );
      if (balance < support.creatorAmount) {
        throw new BadRequestException({
          code: ErrorCodes.REFUND_EXCEEDS_CREATOR_BALANCE,
          message:
            'The creator has already withdrawn part of this money. Refund anyway with allowNegativeBalance to take their balance below zero.',
        });
      }
    }

    const refund = await this.prisma.$transaction(async (tx) => {
      // One refund at a time per payment
      await tx.$queryRaw`SELECT id FROM "payments" WHERE id = ${payment.id} FOR UPDATE`;
      const existing = await tx.refund.findFirst({
        where: {
          paymentId: payment.id,
          status: { in: ACTIVE_REFUND_STATUSES },
        },
      });
      if (existing) {
        throw new ConflictException({
          code: ErrorCodes.REFUND_NOT_ALLOWED,
          message: 'This contribution already has a refund',
        });
      }

      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          reason: options.reason,
          initiatedBy: options.adminId,
          creatorDebit: support.creatorAmount,
          platformDebit: support.platformFee,
        },
      });

      await tx.ledgerEntry.createMany({
        data: [
          {
            accountId: creatorAccount.id,
            transactionId: created.id,
            entryType: LedgerEntryType.REFUND,
            direction: LedgerDirection.DEBIT,
            amount: support.creatorAmount,
            currency: payment.currency,
            reference: `REFUND_CREATOR_${created.id}`,
          },
          {
            accountId: platformAccount.id,
            transactionId: created.id,
            entryType: LedgerEntryType.REFUND,
            direction: LedgerDirection.DEBIT,
            amount: support.platformFee,
            currency: payment.currency,
            reference: `REFUND_FEE_${created.id}`,
          },
        ],
      });
      return created;
    });

    let result: RefundResult;
    try {
      result = await this.paymentProvider.refundPayment({
        paymentReference: payment.providerReference,
        amount: payment.amount,
        reason: options.reason,
      });
    } catch (error) {
      if (error instanceof PaymentProviderRejectedError) {
        await this.applyOutcome(refund.id, 'FAILED', error.message);
        throw new BadRequestException({
          code: ErrorCodes.REFUND_NOT_ALLOWED,
          message: `Paystack rejected the refund: ${error.message}`,
        });
      }
      // Unknown outcome: leave it PENDING. A refund.processed / refund.failed
      // webhook settles it; Paystack refuses a second refund of the same payment.
      this.logger.error(`Refund ${refund.id} has an unknown outcome`, error);
      return refund;
    }

    if (result.status === 'PROCESSED' || result.status === 'FAILED') {
      await this.applyOutcome(
        refund.id,
        result.status,
        result.failureReason,
        result.providerRefundId,
      );
    } else {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: 'PROCESSING',
          providerReference: result.providerRefundId,
        },
      });
    }
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  /**
   * Settles a refund. PROCESSED marks the payment and contribution refunded;
   * FAILED returns the ledger debits. Returns false if it was already settled.
   */
  async applyOutcome(
    refundId: string,
    outcome: 'PROCESSED' | 'FAILED',
    failureReason?: string,
    providerRefundId?: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refund.updateMany({
        where: { id: refundId, status: { in: OPEN_REFUND_STATUSES } },
        data: {
          status: outcome,
          processedAt: new Date(),
          failureReason: outcome === 'FAILED' ? failureReason : null,
          ...(providerRefundId && { providerReference: providerRefundId }),
        },
      });
      if (claimed.count === 0) return false;

      const refund = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { payment: { include: { support: true } } },
      });

      if (outcome === 'PROCESSED') {
        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { status: PaymentStatus.REFUNDED },
        });
        await tx.support.update({
          where: { id: refund.payment.supportId },
          data: { status: SupportStatus.REFUNDED },
        });
        return true;
      }

      const creatorAccount = await tx.account.findFirstOrThrow({
        where: {
          ownerType: AccountType.CREATOR,
          ownerId: refund.payment.support.creatorId,
          currency: refund.currency,
        },
      });
      const platformAccount = await tx.account.findFirstOrThrow({
        where: {
          ownerType: AccountType.PLATFORM,
          ownerId: 'PLATFORM',
          currency: refund.currency,
        },
      });
      await tx.ledgerEntry.createMany({
        data: [
          {
            accountId: creatorAccount.id,
            transactionId: refund.id,
            entryType: LedgerEntryType.ADJUSTMENT,
            direction: LedgerDirection.CREDIT,
            amount: refund.creatorDebit,
            currency: refund.currency,
            reference: `REFUND_REVERSE_CREATOR_${refund.id}`,
          },
          {
            accountId: platformAccount.id,
            transactionId: refund.id,
            entryType: LedgerEntryType.ADJUSTMENT,
            direction: LedgerDirection.CREDIT,
            amount: refund.platformDebit,
            currency: refund.currency,
            reference: `REFUND_REVERSE_FEE_${refund.id}`,
          },
        ],
      });
      return true;
    });
  }

  /**
   * Applies a Paystack refund webhook, found through the original payment's
   * reference. Returns false when no open refund matches.
   */
  async applyProviderEvent(
    paymentReference: string,
    status: 'PROCESSED' | 'FAILED' | 'PROCESSING',
    providerRefundId?: string,
    failureReason?: string,
  ): Promise<boolean> {
    const refund = await this.prisma.refund.findFirst({
      where: {
        status: { in: OPEN_REFUND_STATUSES },
        payment: { providerReference: paymentReference },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!refund) return false;

    if (status === 'PROCESSING') {
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: 'PROCESSING',
          ...(providerRefundId && { providerReference: providerRefundId }),
        },
      });
      return true;
    }
    return this.applyOutcome(
      refund.id,
      status,
      failureReason ?? 'Paystack could not complete the refund.',
      providerRefundId,
    );
  }
}
