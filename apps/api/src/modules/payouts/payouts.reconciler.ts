import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import type { PaymentProvider } from '../../infrastructure/payments/payment-provider.interface';
import { PAYOUT_EVENTS } from '../notifications/events/notification.events';
import { IN_FLIGHT_PAYOUT_STATUSES, PayoutsService } from './payouts.service';

/** "Withdrawals typically arrive within 30 minutes." */
const DELAYED_AFTER_MS = 30 * 60 * 1000;
const BATCH_SIZE = 50;

/**
 * Settles payouts whose Paystack webhook never arrived, and tells the creator
 * when a payout is taking longer than usual. Every update is conditional, so
 * running on several instances at once is safe.
 */
@Injectable()
export class PayoutsReconciler {
  private readonly logger = new Logger(PayoutsReconciler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutsService: PayoutsService,
    @Inject(PAYMENT_PROVIDER)
    private readonly paymentProvider: PaymentProvider,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileStalePayouts() {
    const stale = await this.prisma.payout.findMany({
      where: {
        status: { in: IN_FLIGHT_PAYOUT_STATUSES },
        requestedAt: { lt: new Date(Date.now() - DELAYED_AFTER_MS) },
      },
      orderBy: { requestedAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const payout of stale) {
      try {
        const result = await this.paymentProvider.verifyTransfer(
          payout.providerReference ?? '',
        );

        if (result.status === 'NOT_FOUND') {
          // The transfer never reached Paystack, so no money moved
          await this.payoutsService.applyTransferOutcome(
            payout.id,
            'FAILED',
            'The transfer could not be started.',
          );
        } else if (result.status !== 'PENDING') {
          await this.payoutsService.applyTransferOutcome(
            payout.id,
            result.status,
          );
        } else if (!payout.delayNotifiedAt) {
          const claimed = await this.prisma.payout.updateMany({
            where: { id: payout.id, delayNotifiedAt: null },
            data: { delayNotifiedAt: new Date() },
          });
          if (claimed.count === 1) {
            await this.payoutsService.emitPayoutEvent(
              PAYOUT_EVENTS.DELAYED,
              payout,
            );
          }
        }
      } catch (error) {
        this.logger.error(`Could not reconcile payout ${payout.id}`, error);
      }
    }
  }
}
