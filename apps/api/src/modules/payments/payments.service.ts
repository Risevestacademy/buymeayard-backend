import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
import { LedgerService } from '../ledger/ledger.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { CreatorStatus, PaymentStatus, SupportStatus } from '@buymeayard/types';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { CONTRIBUTION_EVENTS } from '../notifications/events/notification.events';
import { PayoutsService, TransferOutcome } from '../payouts/payouts.service';
import { RefundsService } from './refunds.service';
import { toContributionMaterial } from '../supports/mappers/contribution-material.mapper';
import { resolveCallbackUrl } from './utils/callback-url.util';
import { resolveThankYouMessage } from '../supports/utils/thank-you-message.util';

const TRANSFER_OUTCOMES: Record<string, TransferOutcome> = {
  'transfer.success': 'SUCCESS',
  'transfer.failed': 'FAILED',
  'transfer.reversed': 'REVERSED',
};

const REFUND_EVENTS: Record<string, 'PROCESSED' | 'FAILED' | 'PROCESSING'> = {
  'refund.processed': 'PROCESSED',
  'refund.failed': 'FAILED',
  'refund.processing': 'PROCESSING',
  'refund.pending': 'PROCESSING',
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly ledgerService: LedgerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly payoutsService: PayoutsService,
    private readonly refundsService: RefundsService,
  ) {}

  async initializePayment(
    supportId: string,
    email?: string,
    callbackUrl?: string,
  ) {
    const callback = resolveCallbackUrl(callbackUrl, supportId);
    const support = await this.prisma.support.findUnique({
      where: { id: supportId },
      include: { creator: { select: { status: true } } },
    });

    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Support transaction not found',
      });
    }

    // Re-check at checkout: the creator may have lost verification since the
    // support was created. Already-captured payments are never blocked.
    if (support.creator.status !== CreatorStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCodes.CREATOR_NOT_ACTIVE,
        message: 'This creator is not accepting contributions yet',
      });
    }

    if (
      support.status !== SupportStatus.CREATED &&
      support.status !== SupportStatus.PAYMENT_PENDING
    ) {
      throw new BadRequestException({
        code: ErrorCodes.PAYMENT_ALREADY_PROCESSED,
        message: 'This support has already been processed or paid',
      });
    }

    // Create payment attempt record
    const payment = await this.prisma.payment.create({
      data: {
        supportId: support.id,
        provider: this.paymentProvider.providerName,
        providerReference: `temp_${Date.now()}_${support.id.slice(0, 8)}`,
        amount: support.totalAmount,
        currency: support.currency,
        status: PaymentStatus.PENDING,
      },
    });

    // Initialize with Paystack
    const initResult = await this.paymentProvider.initializePayment({
      paymentId: payment.id,
      supportId: support.id,
      amount: support.totalAmount,
      currency: support.currency,
      email: email || support.guestEmail || 'supporter@buymeayard.com',
      callbackUrl: callback,
    });

    // Update payment with provider reference
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerReference: initResult.providerReference,
        status: PaymentStatus.PROCESSING,
      },
    });

    await this.prisma.support.update({
      where: { id: support.id },
      data: { status: SupportStatus.PAYMENT_PENDING },
    });

    return {
      paymentId: payment.id,
      providerReference: initResult.providerReference,
      authorizationUrl: initResult.authorizationUrl,
    };
  }

  /**
   * What the page Paystack sends the supporter back to needs: whether the
   * gift is paid yet (the webhook can land a moment after the redirect) and
   * the thank-you message to show. The support id is the only credential.
   */
  async getSupportStatus(supportId: string) {
    const support = await this.prisma.support.findUnique({
      where: { id: supportId },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        currency: true,
        items: {
          select: {
            quantity: true,
            materialNameSnapshot: true,
            creatorMaterial: {
              select: {
                materialId: true,
                material: {
                  select: {
                    color: true,
                    thumbnailSmallUrl: true,
                    imageUrl: true,
                  },
                },
              },
            },
          },
        },
        creator: { select: { creatorName: true, thankYouMessage: true } },
      },
    });
    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Support transaction not found',
      });
    }

    const yards = support.items.reduce(
      (sum, item) => sum.add(item.quantity),
      new Prisma.Decimal(0),
    );
    return {
      supportId: support.id,
      status: support.status,
      paid:
        support.status === SupportStatus.PAID ||
        support.status === SupportStatus.COMPLETED,
      amount: support.totalAmount,
      currency: support.currency,
      yards: yards.toNumber(),
      material: support.items[0]
        ? toContributionMaterial(
            support.items[0].creatorMaterial.materialId,
            support.items[0].materialNameSnapshot,
            support.items[0].creatorMaterial.material,
            yards.toNumber(),
          )
        : null,
      materialName: support.items[0]?.materialNameSnapshot ?? null,
      creatorName: support.creator.creatorName,
      thankYouMessage: resolveThankYouMessage(support.creator.thankYouMessage),
    };
  }

  async handleWebhook(
    signature: string,
    payload: any,
    rawBody: string | Buffer,
  ) {
    const verification = await this.paymentProvider.verifyWebhookSignature(
      signature,
      rawBody,
    );
    if (!verification.isValid) {
      throw new BadRequestException({
        code: ErrorCodes.WEBHOOK_VERIFICATION_FAILED,
        message: 'Invalid webhook signature',
      });
    }

    const eventType = payload.event;
    // One object (e.g. a transfer) can send several events, such as
    // transfer.failed then transfer.reversed, so the key includes the type.
    const eventId = `${eventType}:${
      payload.event_id ||
      payload.data?.id?.toString() ||
      payload.data?.refund_reference ||
      payload.data?.reference
    }`;

    // Webhook Idempotency Check
    const existingEvent = await this.prisma.paymentEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: this.paymentProvider.providerName,
          providerEventId: eventId,
        },
      },
    });

    if (existingEvent) {
      this.logger.warn(`Webhook event ${eventId} already processed.`);
      return { status: 'already_processed' };
    }

    if (TRANSFER_OUTCOMES[eventType]) {
      return this.handleTransferEvent(eventType, eventId, payload);
    }

    if (REFUND_EVENTS[eventType]) {
      return this.handleRefundEvent(eventType, eventId, payload);
    }

    if (eventType === 'charge.success') {
      const reference = payload.data.reference;
      const payment = await this.prisma.payment.findUnique({
        where: {
          provider_providerReference: {
            provider: this.paymentProvider.providerName,
            providerReference: reference,
          },
        },
        include: {
          support: {
            include: {
              creator: {
                select: { userId: true },
              },
              items: true,
            },
          },
        },
      });

      if (payment && payment.status !== PaymentStatus.SUCCESS) {
        await this.prisma.$transaction(async (tx) => {
          // 1. Mark payment as SUCCESS
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.SUCCESS,
              paidAt: new Date(),
              providerTransactionId: payload.data.id?.toString(),
            },
          });

          // 2. Mark support as PAID
          await tx.support.update({
            where: { id: payment.supportId },
            data: { status: SupportStatus.PAID },
          });

          // 3. Record event
          await tx.paymentEvent.create({
            data: {
              paymentId: payment.id,
              provider: this.paymentProvider.providerName,
              eventType,
              providerEventId: eventId,
              payload,
              processedAt: new Date(),
            },
          });
        });

        // 4. Ledger credit entries
        await this.ledgerService.recordSupportPayment(
          payment.id,
          payment.support.creatorId,
          payment.support.creatorAmount,
          payment.support.platformFee,
          payment.currency,
        );

        // 5. Emit contribution received event for creator notifications (in-app & email)
        const yards = payment.support.items
          .reduce((sum, item) => sum.add(item.quantity), new Prisma.Decimal(0))
          .toNumber();
        const materialName =
          payment.support.items
            .map((i) => i.materialNameSnapshot)
            .filter(Boolean)
            .join(', ') || 'Fabric';
        const supporterName = payment.support.isAnonymous
          ? 'Anonymous'
          : payment.support.guestName || 'A supporter';
        const supporterEmail = payment.support.isAnonymous
          ? undefined
          : payment.support.guestEmail || undefined;

        this.eventEmitter.emit(CONTRIBUTION_EVENTS.RECEIVED, {
          supportId: payment.support.id,
          creatorUserId: payment.support.creator.userId,
          supporterName,
          supporterEmail,
          yards: yards > 0 ? yards : 1,
          materialName,
          amount: payment.support.creatorAmount,
          message: payment.support.message,
        });
      }
    }

    return { received: true };
  }

  private async handleRefundEvent(
    eventType: string,
    eventId: string,
    payload: any,
  ) {
    const data = payload.data ?? {};
    const paymentReference: string =
      data.transaction_reference ?? data.transaction?.reference ?? '';
    const applied = await this.refundsService.applyProviderEvent(
      paymentReference,
      REFUND_EVENTS[eventType],
      data.id?.toString(),
      data.customer_note || data.merchant_note,
    );
    if (!applied) {
      this.logger.warn(
        `Refund event ${eventId} does not match an open refund, ignoring.`,
      );
    }

    const payment = paymentReference
      ? await this.prisma.payment.findFirst({
          where: { providerReference: paymentReference },
          select: { id: true },
        })
      : null;
    try {
      await this.prisma.paymentEvent.create({
        data: {
          paymentId: payment?.id,
          provider: this.paymentProvider.providerName,
          eventType,
          providerEventId: eventId,
          payload,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }
    return { received: true };
  }

  private async handleTransferEvent(
    eventType: string,
    eventId: string,
    payload: any,
  ) {
    const payout = await this.payoutsService.findByProviderReference(
      payload.data?.reference ?? '',
    );
    if (!payout) {
      this.logger.warn(
        `Transfer event ${eventId} does not match any payout, ignoring.`,
      );
      return { received: true };
    }

    await this.payoutsService.applyTransferOutcome(
      payout.id,
      TRANSFER_OUTCOMES[eventType],
    );

    try {
      await this.prisma.paymentEvent.create({
        data: {
          payoutId: payout.id,
          provider: this.paymentProvider.providerName,
          eventType,
          providerEventId: eventId,
          payload,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      // A concurrent delivery of the same event already recorded it
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }

    return { received: true };
  }
}
