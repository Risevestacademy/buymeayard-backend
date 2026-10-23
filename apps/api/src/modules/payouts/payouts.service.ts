import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Payout, Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  PAYMENT_PROVIDER,
  PaymentProviderRejectedError,
} from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
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

import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PAYOUT_EVENTS,
  PayoutNotificationEvent,
} from '../notifications/events/notification.events';
import { PayoutMethodsService } from './payout-methods.service';
import { calculatePayoutFee } from './payout-fees';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { buildPagination } from '../../common/utils/pagination.util';
import {
  ListPayoutsQueryDto,
  PayoutDetailDto,
  PayoutDisplayStatus,
  PayoutDto,
  PayoutListDto,
  PayoutQuoteDto,
  PayoutStatusFilter,
} from './dto/payout.dto';

/** Payouts that have left the balance but not yet reached a final state. */
export const IN_FLIGHT_PAYOUT_STATUSES: string[] = [
  PayoutStatus.REQUESTED,
  PayoutStatus.PENDING,
  PayoutStatus.PROCESSING,
];

const STATUS_FILTERS: Record<PayoutStatusFilter, string[] | null> = {
  all: null,
  successful: [PayoutStatus.SUCCESS],
  failed: [PayoutStatus.FAILED, PayoutStatus.CANCELLED],
  in_progress: IN_FLIGHT_PAYOUT_STATUSES,
};

const DEFAULT_FAILURE_REASON = 'Your bank declined the transfer.';

export type TransferOutcome = 'SUCCESS' | 'FAILED' | 'REVERSED';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledgerService: LedgerService,
    private readonly payoutMethods: PayoutMethodsService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly eventEmitter: EventEmitter2,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async quote(creatorUserId: string, amount: number): Promise<PayoutQuoteDto> {
    const creator = await this.getCreator(creatorUserId);
    const account = await this.ledgerService.getOrCreateAccount(
      AccountType.CREATOR,
      creator.id,
    );
    const availableBalance = await this.ledgerService.getAccountBalance(
      account.id,
    );
    const rules = await this.platformSettings.get();
    const fee = amount > 0 ? calculatePayoutFee(amount, rules) : 0;

    let error: PayoutQuoteDto['error'] = null;
    if (amount < rules.minimumWithdrawal) error = 'BELOW_MINIMUM';
    else if (amount > availableBalance) error = 'EXCEEDS_BALANCE';

    return {
      amount,
      fee,
      netAmount: Math.max(amount - fee, 0),
      minimumWithdrawal: rules.minimumWithdrawal,
      availableBalance,
      isValid: error === null,
      error,
    };
  }

  async requestPayout(
    creatorUserId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<PayoutDetailDto> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_AMOUNT,
        message: 'Payout amount must be greater than 0',
      });
    }
    const rules = await this.platformSettings.get();
    if (amount < rules.minimumWithdrawal) {
      throw new BadRequestException({
        code: ErrorCodes.BELOW_MINIMUM_WITHDRAWAL,
        message: `You need at least ₦${(rules.minimumWithdrawal / 100).toLocaleString()} to withdraw`,
      });
    }

    const creator = await this.getCreator(creatorUserId);

    if (idempotencyKey) {
      const existing = await this.prisma.payout.findUnique({
        where: {
          creatorId_idempotencyKey: { creatorId: creator.id, idempotencyKey },
        },
      });
      if (existing) return this.toDetailDto(existing);
    }

    this.assertCanWithdraw(creator);

    const method = await this.payoutMethods.getActiveMethod(creator.id);
    if (!method?.recipientCode) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_METHOD_REQUIRED,
        message: 'Add a verified bank account before withdrawing',
      });
    }

    const currency = 'NGN';
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

    const fee = calculatePayoutFee(amount, rules);

    let payout: Payout;
    try {
      payout = await this.prisma.$transaction(async (tx) => {
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

        const reference = await this.nextReference(tx);

        // 1. Create payout record with a snapshot of the destination account
        const created = await tx.payout.create({
          data: {
            creatorId: creator.id,
            accountId: account.id,
            payoutMethodId: method.id,
            reference,
            // Paystack only accepts lowercase transfer references
            providerReference: reference.toLowerCase(),
            idempotencyKey,
            amount,
            fee,
            netAmount: amount - fee,
            currency,
            status: PayoutStatus.REQUESTED,
            bankName: method.bankName,
            bankCode: method.bankCode,
            accountName: method.accountName,
            accountNumberLast4: method.accountIdentifier.slice(-4),
            requestedAt: new Date(),
          },
        });

        // 2. Reserve funds immediately in ledger to prevent double-spending
        await tx.ledgerEntry.create({
          data: {
            accountId: account.id,
            transactionId: created.id,
            entryType: LedgerEntryType.PAYOUT_RESERVATION,
            direction: LedgerDirection.DEBIT,
            amount,
            currency,
            reference: `PAYOUT_RESERVE_${created.id}`,
          },
        });

        return created;
      });
    } catch (error) {
      // A concurrent request with the same idempotency key won the race
      if (
        idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.payout.findUniqueOrThrow({
          where: {
            creatorId_idempotencyKey: { creatorId: creator.id, idempotencyKey },
          },
        });
        return this.toDetailDto(existing);
      }
      throw error;
    }

    const updated = await this.startTransfer(payout, method.recipientCode);
    return this.toDetailDto(updated);
  }

  async listPayouts(
    creatorUserId: string,
    query: ListPayoutsQueryDto,
  ): Promise<PayoutListDto> {
    const creator = await this.getCreator(creatorUserId);
    const statuses = STATUS_FILTERS[query.status];
    const where: Prisma.PayoutWhereInput = {
      creatorId: creator.id,
      ...(statuses && { status: { in: statuses } }),
    };

    const [total, payouts] = await Promise.all([
      this.prisma.payout.count({ where }),
      this.prisma.payout.findMany({
        where,
        orderBy: { requestedAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items: payouts.map((p) => this.toDto(p)),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async getPayout(
    creatorUserId: string,
    payoutId: string,
  ): Promise<PayoutDetailDto> {
    const creator = await this.getCreator(creatorUserId);
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, creatorId: creator.id },
    });
    if (!payout) {
      throw new NotFoundException({
        code: ErrorCodes.PAYOUT_NOT_FOUND,
        message: 'Payout not found',
      });
    }
    return this.toDetailDto(payout);
  }

  /**
   * Moves a payout to its final state. Failed and reversed transfers return
   * the full amount (fee included) to the balance. Returns false when the
   * payout was already in that state, so callers can skip side effects.
   */
  async applyTransferOutcome(
    payoutId: string,
    outcome: TransferOutcome,
    failureReason?: string,
  ): Promise<boolean> {
    // A transfer Paystack reported as successful can still be reversed later
    const fromStatuses =
      outcome === 'REVERSED'
        ? [...IN_FLIGHT_PAYOUT_STATUSES, PayoutStatus.SUCCESS]
        : IN_FLIGHT_PAYOUT_STATUSES;
    const status =
      outcome === 'SUCCESS' ? PayoutStatus.SUCCESS : PayoutStatus.FAILED;

    const payout = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payout.updateMany({
        where: { id: payoutId, status: { in: fromStatuses } },
        data: {
          status,
          processedAt: new Date(),
          failureReason:
            status === PayoutStatus.FAILED
              ? failureReason || DEFAULT_FAILURE_REASON
              : null,
        },
      });
      if (claimed.count === 0) return null;

      const updated = await tx.payout.findUniqueOrThrow({
        where: { id: payoutId },
      });
      if (status === PayoutStatus.FAILED) {
        await tx.ledgerEntry.create({
          data: {
            accountId: updated.accountId,
            transactionId: updated.id,
            entryType: LedgerEntryType.PAYOUT_REVERSED,
            direction: LedgerDirection.CREDIT,
            amount: updated.amount,
            currency: updated.currency,
            reference: `PAYOUT_REVERSE_${updated.id}`,
          },
        });
      }
      return updated;
    });

    if (!payout) return false;

    await this.emitPayoutEvent(
      status === PayoutStatus.SUCCESS
        ? PAYOUT_EVENTS.SUCCESS
        : PAYOUT_EVENTS.FAILED,
      payout,
    );
    return true;
  }

  /**
   * Admin: asks Paystack what happened to a payout that is still in flight and
   * applies the answer. Returns the payout as it stands afterwards.
   */
  async reconcilePayout(payoutId: string): Promise<Payout> {
    const payout = await this.getInFlightPayout(payoutId);
    const result = await this.paymentProvider.verifyTransfer(
      payout.providerReference ?? '',
    );
    if (result.status === 'NOT_FOUND') {
      // The transfer never reached Paystack, so no money moved
      await this.applyTransferOutcome(
        payout.id,
        'FAILED',
        'The transfer could not be started.',
      );
    } else if (result.status !== 'PENDING') {
      await this.applyTransferOutcome(payout.id, result.status);
    }
    return this.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
  }

  /**
   * Admin: sends a stuck payout (REQUESTED or PENDING) to Paystack again. The
   * transfer reference is reused, so Paystack refuses a duplicate: if it
   * already has the transfer, its state is applied instead of sending twice.
   */
  async retryTransfer(payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { payoutMethod: true },
    });
    if (!payout) this.throwPayoutNotFound();
    if (
      payout.status !== PayoutStatus.REQUESTED &&
      payout.status !== PayoutStatus.PENDING
    ) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_ALREADY_PROCESSED,
        message: `A ${payout.status} payout cannot be retried`,
      });
    }
    const recipientCode = payout.payoutMethod?.recipientCode;
    if (!recipientCode) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_METHOD_REQUIRED,
        message: 'The payout has no bank recipient to send to',
      });
    }

    const existing = await this.paymentProvider.verifyTransfer(
      payout.providerReference ?? '',
    );
    if (existing.status === 'NOT_FOUND') {
      return this.startTransfer(payout, recipientCode);
    }
    return this.reconcilePayout(payoutId);
  }

  /**
   * Admin: cancels a payout whose transfer was never sent, returning the
   * reserved amount to the creator's balance.
   */
  async cancelPayout(payoutId: string, reason: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) this.throwPayoutNotFound();
    if (payout.status !== PayoutStatus.REQUESTED) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_ALREADY_PROCESSED,
        message:
          'Only a payout whose transfer has not started can be cancelled. Reconcile it instead.',
      });
    }
    const existing = await this.paymentProvider.verifyTransfer(
      payout.providerReference ?? '',
    );
    if (existing.status !== 'NOT_FOUND') {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_ALREADY_PROCESSED,
        message: 'Paystack already has this transfer. Reconcile it instead.',
      });
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payout.updateMany({
        where: { id: payoutId, status: PayoutStatus.REQUESTED },
        data: {
          status: PayoutStatus.CANCELLED,
          processedAt: new Date(),
          failureReason: reason,
        },
      });
      if (claimed.count === 0) return null;
      await tx.ledgerEntry.create({
        data: {
          accountId: payout.accountId,
          transactionId: payout.id,
          entryType: LedgerEntryType.PAYOUT_REVERSED,
          direction: LedgerDirection.CREDIT,
          amount: payout.amount,
          currency: payout.currency,
          reference: `PAYOUT_REVERSE_${payout.id}`,
        },
      });
      return tx.payout.findUniqueOrThrow({ where: { id: payoutId } });
    });
    if (!cancelled) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_ALREADY_PROCESSED,
        message: 'The payout changed state while cancelling',
      });
    }
    await this.emitPayoutEvent(PAYOUT_EVENTS.FAILED, cancelled);
    return cancelled;
  }

  private async getInFlightPayout(payoutId: string): Promise<Payout> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) this.throwPayoutNotFound();
    if (!IN_FLIGHT_PAYOUT_STATUSES.includes(payout.status)) {
      throw new BadRequestException({
        code: ErrorCodes.PAYOUT_ALREADY_PROCESSED,
        message: `The payout is already ${payout.status}`,
      });
    }
    return payout;
  }

  private throwPayoutNotFound(): never {
    throw new NotFoundException({
      code: ErrorCodes.PAYOUT_NOT_FOUND,
      message: 'Payout not found',
    });
  }

  /** Finds the payout a Paystack transfer reference belongs to. */
  async findByProviderReference(reference: string): Promise<Payout | null> {
    return this.prisma.payout.findFirst({
      where: { providerReference: reference.toLowerCase() },
    });
  }

  async emitPayoutEvent(
    event: (typeof PAYOUT_EVENTS)[keyof typeof PAYOUT_EVENTS],
    payout: Payout,
  ) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { id: payout.creatorId },
      select: { userId: true },
    });
    if (!creator) return;

    const payload: PayoutNotificationEvent = {
      payoutId: payout.id,
      creatorUserId: creator.userId,
      amount: payout.amount,
      fee: payout.fee,
      netAmount: payout.netAmount,
      currency: payout.currency,
      reference: payout.reference ?? undefined,
      bankName: payout.bankName ?? undefined,
      accountNumberMasked: payout.accountNumberLast4
        ? `••••${payout.accountNumberLast4}`
        : undefined,
      failureReason: payout.failureReason ?? undefined,
    };
    this.eventEmitter.emit(event, payload);
  }

  /**
   * Sends the transfer to Paystack. A definite rejection fails the payout and
   * restores the balance; an unknown outcome (network error) leaves it
   * PENDING for the reconciler to settle.
   */
  private async startTransfer(
    payout: Payout,
    recipientCode: string,
  ): Promise<Payout> {
    try {
      const result = await this.paymentProvider.initiateTransfer({
        amount: payout.netAmount,
        recipientCode,
        reference: payout.providerReference!,
        reason: `Buy Me a Yard payout ${payout.reference}`,
      });

      if (result.status === 'SUCCESS' || result.status === 'FAILED') {
        await this.applyTransferOutcome(payout.id, result.status);
      } else {
        await this.prisma.payout.updateMany({
          where: { id: payout.id, status: PayoutStatus.REQUESTED },
          data: {
            status: PayoutStatus.PROCESSING,
            providerTransferCode: result.transferCode,
          },
        });
      }
    } catch (error) {
      if (error instanceof PaymentProviderRejectedError) {
        this.logger.warn(
          `Transfer for payout ${payout.id} rejected: ${error.message}`,
        );
        await this.applyTransferOutcome(
          payout.id,
          'FAILED',
          'The transfer could not be started.',
        );
      } else {
        this.logger.error(
          `Transfer for payout ${payout.id} has an unknown outcome`,
          error,
        );
        await this.prisma.payout.updateMany({
          where: { id: payout.id, status: PayoutStatus.REQUESTED },
          data: { status: PayoutStatus.PENDING },
        });
      }
    }

    return this.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
  }

  /** PYT-YYYYMMDD-0041: the date in Lagos time plus a global sequence. */
  private async nextReference(tx: Prisma.TransactionClient): Promise<string> {
    const [{ nextval }] = await tx.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('payout_reference_seq')`;
    const date = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
      .replace(/-/g, '');
    return `PYT-${date}-${nextval.toString().padStart(4, '0')}`;
  }

  private async getCreator(creatorUserId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      select: { id: true, status: true, kycStatus: true },
    });
    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }
    return creator;
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

  private toDto(payout: Payout): PayoutDto {
    return {
      id: payout.id,
      reference: payout.reference,
      status: toDisplayStatus(payout.status),
      amount: payout.amount,
      fee: payout.fee,
      netAmount: payout.netAmount,
      currency: payout.currency,
      destination: {
        bankName: payout.bankName,
        accountName: payout.accountName,
        accountNumberLast4: payout.accountNumberLast4,
      },
      requestedAt: payout.requestedAt,
      processedAt: payout.processedAt,
    };
  }

  private toDetailDto(payout: Payout): PayoutDetailDto {
    const failed =
      toDisplayStatus(payout.status) === PayoutDisplayStatus.FAILED;
    return {
      ...this.toDto(payout),
      breakdown: {
        amountRequested: payout.amount,
        transferred: failed ? 0 : payout.netAmount,
        feeCharged: failed ? 0 : payout.fee,
        returnedToBalance: failed ? payout.amount : 0,
      },
      failureReason: payout.failureReason,
    };
  }
}

export function toDisplayStatus(status: string): PayoutDisplayStatus {
  if (status === PayoutStatus.SUCCESS) return PayoutDisplayStatus.SUCCESSFUL;
  if (status === PayoutStatus.FAILED || status === PayoutStatus.CANCELLED) {
    return PayoutDisplayStatus.FAILED;
  }
  return PayoutDisplayStatus.IN_PROGRESS;
}
