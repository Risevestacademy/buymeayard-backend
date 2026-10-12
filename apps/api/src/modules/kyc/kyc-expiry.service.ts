import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycSubmissionStatus as S } from '@buymeayard/types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { KycService } from './kyc.service';
import { OPEN_SUBMISSION_STATUSES } from './kyc-state';

const DEFAULT_SESSION_TTL_MINUTES = 30;
const SWEEP_INTERVAL_MS = 5 * 60_000;
const BATCH_SIZE = 50;

/**
 * Backstop for the lazy expiry in KycService: creators who abandon a session
 * and never check their status would otherwise stay PENDING forever. Runs on
 * every API instance; the transition's expectedFrom guard makes concurrent
 * sweeps safe (only one wins, the rest no-op).
 */
@Injectable()
export class KycExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KycExpiryService.name);
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly kyc: KycService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.handleExpiry();
    }, SWEEP_INTERVAL_MS);
    // Don't hold the process open just for the sweep (matters for CLI/tests).
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async handleExpiry(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.expireStaleSubmissions();
    } catch (err) {
      this.logger.error(
        `KYC expiry sweep failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async expireStaleSubmissions(): Promise<void> {
    const cutoff = new Date(Date.now() - this.sessionTtlMinutes() * 60_000);
    const stale = await this.prisma.kycSubmission.findMany({
      where: {
        status: { in: [...OPEN_SUBMISSION_STATUSES] },
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });

    let expired = 0;
    for (const { id } of stale) {
      const submission = await this.prisma.kycSubmission.findUnique({
        where: { id },
      });
      if (!submission || !OPEN_SUBMISSION_STATUSES.has(submission.status)) {
        continue;
      }

      // Reconcile first so a stored decision the webhook missed isn't lost;
      // only fall back to a local expiry when the provider still says open.
      let current = submission;
      if (current.providerReference) {
        try {
          current = await this.kyc.reconcileSubmission(current);
        } catch (err) {
          this.logger.warn(
            `KYC reconcile failed for submission ${id}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      if (!OPEN_SUBMISSION_STATUSES.has(current.status)) continue;

      try {
        const result = await this.kyc.expireSubmission(current);
        if (result.status === S.EXPIRED) expired += 1;
      } catch (err) {
        this.logger.warn(
          `KYC expiry failed for submission ${id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} stale KYC submission(s)`);
    }
  }

  private sessionTtlMinutes(): number {
    const minutes = this.configService.get<number>('KYC_SESSION_TTL_MINUTES');
    return minutes && minutes > 0 ? minutes : DEFAULT_SESSION_TTL_MINUTES;
  }
}
