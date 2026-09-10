import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
import { LedgerService } from '../ledger/ledger.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { PaymentStatus, SupportStatus } from '@buymeayard/types';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
    private readonly ledgerService: LedgerService,
  ) {}

  async initializePayment(supportId: string, email: string) {
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
      email: email || support.supporter?.email || 'supporter@buymeayard.com',
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

    if (eventType === 'charge.success') {
      const reference = payload.data.reference;
      const payment = await this.prisma.payment.findUnique({
        where: {
          provider_providerReference: {
            provider: this.paymentProvider.providerName,
            providerReference: reference,
          },
        },
        include: { support: true },
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
      }
    }

    return { received: true };
  }
}
