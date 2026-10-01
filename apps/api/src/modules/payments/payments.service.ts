import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
import { LedgerService } from '../ledger/ledger.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PaymentStatus, SupportStatus, PayoutStatus } from '@buymeayard/types';
import {
  PaymentCompletedEvent,
  PAYMENT_EVENTS,
} from './events/payment-completed.event';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly ledgerService: LedgerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async initializePayment(
    supportId: string,
    email?: string,
    callbackUrl?: string,
  ) {
    const support = await this.prisma.support.findUnique({
      where: { id: supportId },
      include: { supporter: true },
    });

    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Support transaction not found',
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

    const payerEmail = email || support.supporter?.email;

    if (!payerEmail) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Supporter email is required to initialize checkout',
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
      email: payerEmail,
      callbackUrl,
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
      accessCode: initResult.accessCode,
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

    const eventId =
      payload.event_id ||
      payload.data?.id?.toString() ||
      payload.data?.reference;
    const eventType = payload.event;

    this.logger.log(
      `Processing Paystack webhook event: ${eventType} (ID: ${eventId})`,
    );

    // -------------------------------------------------------------
    // 1. CHARGE SUCCESS (Support Order Paid)
    // -------------------------------------------------------------
    if (eventType === 'charge.success') {
      // Webhook Idempotency Check for charge events
      const existingEvent = await this.prisma.paymentEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: this.paymentProvider.providerName,
            providerEventId: eventId,
          },
        },
      });

      if (existingEvent) {
        this.logger.warn(`Webhook charge event ${eventId} already processed.`);
        return { received: true, status: 'already_processed' };
      }

      const reference = payload.data?.reference;
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
              supporter: true,
              items: true,
            },
          },
        },
      });

      if (!payment) {
        this.logger.warn(`No payment found for reference ${reference}`);
        return { received: true, status: 'payment_not_found' };
      }

      // Security check: Verify gateway amount & currency match internal payment record
      const webhookAmount = BigInt(payload.data?.amount ?? 0);
      const webhookCurrency = payload.data?.currency || 'NGN';

      if (
        webhookAmount !== payment.amount ||
        webhookCurrency !== payment.currency
      ) {
        this.logger.error(
          `SECURITY ALERT: Webhook amount/currency mismatch for payment ${payment.id}. ` +
            `Expected: ${payment.amount} ${payment.currency}, Received: ${webhookAmount} ${webhookCurrency}`,
        );
        return { received: true, status: 'amount_mismatch' };
      }

      if (payment.status !== PaymentStatus.SUCCESS) {
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

          // 3. Record event for idempotency
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

        // 5. Emit payment.completed event for Engineer 2 (Supporter wall, receipts, SSE)
        this.eventEmitter.emit(
          PAYMENT_EVENTS.COMPLETED,
          new PaymentCompletedEvent(
            payment.id,
            payment.supportId,
            payment.support.creatorId,
            payment.support.supporterId,
            payment.support.totalAmount,
            payment.support.creatorAmount,
            payment.support.platformFee,
            payment.currency,
            payment.support.supporter?.name,
            payment.support.supporter?.email,
            payment.support.message,
            payment.support.isAnonymous,
            payment.support.items.map((i) => ({
              materialName: i.materialNameSnapshot,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              totalPrice: i.totalPrice,
            })),
          ),
        );

        this.logger.log(
          `Successfully processed charge.success for payment ${payment.id} and support ${payment.supportId}`,
        );
      }

      return { received: true };
    }

    // -------------------------------------------------------------
    // 2. TRANSFER SUCCESS (Creator Bank Payout Completed)
    // -------------------------------------------------------------
    if (eventType === 'transfer.success') {
      const transferReference =
        payload.data?.reference || payload.data?.transfer_code;

      const payout = await this.prisma.payout.findFirst({
        where: {
          OR: [
            { providerReference: transferReference },
            { id: transferReference },
          ],
        },
      });

      if (!payout) {
        this.logger.warn(
          `No payout found matching transfer reference ${transferReference}`,
        );
        return { received: true, status: 'payout_not_found' };
      }

      if (payout.status !== PayoutStatus.SUCCESS) {
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.SUCCESS,
            processedAt: new Date(),
          },
        });

        // Audit log for traceability
        await this.prisma.auditLog.create({
          data: {
            action: 'PAYOUT_TRANSFER_SUCCESS',
            resourceType: 'PAYOUT',
            resourceId: payout.id,
            newState: { status: PayoutStatus.SUCCESS, eventId },
            metadata: payload.data,
          },
        });

        this.logger.log(
          `Payout ${payout.id} marked as SUCCESS via transfer.success webhook`,
        );
      }

      return { received: true };
    }

    // -------------------------------------------------------------
    // 3. TRANSFER FAILED (Creator Bank Payout Failed / Reversed)
    // -------------------------------------------------------------
    if (eventType === 'transfer.failed' || eventType === 'transfer.reversed') {
      const transferReference =
        payload.data?.reference || payload.data?.transfer_code;
      const failureReason =
        payload.data?.reason ||
        payload.data?.message ||
        'Bank transfer failed at provider';

      const payout = await this.prisma.payout.findFirst({
        where: {
          OR: [
            { providerReference: transferReference },
            { id: transferReference },
          ],
        },
      });

      if (!payout) {
        this.logger.warn(
          `No payout found matching transfer reference ${transferReference}`,
        );
        return { received: true, status: 'payout_not_found' };
      }

      if (
        payout.status === PayoutStatus.PROCESSING ||
        payout.status === PayoutStatus.PENDING ||
        payout.status === PayoutStatus.REQUESTED
      ) {
        await this.prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: PayoutStatus.FAILED,
            failureReason,
          },
        });

        // Reverse the ledger reservation so creator's available balance is restored
        await this.ledgerService.recordPayoutReversal(
          payout.id,
          payout.accountId,
          payout.amount,
          payout.currency,
          failureReason,
        );

        // Audit log for traceability
        await this.prisma.auditLog.create({
          data: {
            action: 'PAYOUT_TRANSFER_FAILED',
            resourceType: 'PAYOUT',
            resourceId: payout.id,
            newState: { status: PayoutStatus.FAILED, failureReason, eventId },
            metadata: payload.data,
          },
        });

        this.logger.warn(
          `Payout ${payout.id} failed (${failureReason}). Funds reversed to creator ledger.`,
        );
      }

      return { received: true };
    }

    return { received: true, status: 'unhandled_event' };
  }
}
