import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KycSubmission, Prisma } from '@prisma/client';
import {
  KycReviewSource,
  KycStatus,
  KycSubmissionStatus as S,
} from '@buymeayard/types';
import { ErrorCodes } from '../../common/errors/error-codes';
import type { KycDecisionSummary } from '../../infrastructure/kyc/kyc-provider.interface';
import {
  checkSubmissionTransition,
  creatorStatusForKyc,
  kycStatusForSubmission,
  kycStatusFromPriorOutcome,
} from './kyc-state';
import { rejectionReasonFromWarnings } from './kyc-reasons';

export interface TransitionInput {
  submissionId: string;
  to: S;
  source: KycReviewSource;
  actorId?: string | null;
  providerStatus?: string | null;
  /**
   * Provider (Didit) timestamp of the change. Events older than the last
   * applied provider timestamp are ignored. Only pass provider-clock values
   * here; never our own clock.
   */
  occurredAt?: Date | null;
  /** Apply only if the submission is currently in one of these states. */
  expectedFrom?: S[];
  summary?: KycDecisionSummary | null;
  /** Explicit user-facing reason (admin rejections); otherwise derived. */
  rejectionReason?: string | null;
  reviewNote?: string | null;
  eventId?: string | null;
}

export interface TransitionOutcome {
  changed: boolean;
  reason?: 'same_status' | 'stale_event' | 'not_allowed' | 'unexpected_state';
  submission: KycSubmission;
}

export interface CreatorSyncResult {
  isLatest: boolean;
  kycStatus: string | null;
}

const FINISHED_STATUSES: ReadonlySet<string> = new Set([
  S.VERIFIED,
  S.REJECTED,
  S.ABANDONED,
  S.EXPIRED,
  S.KYC_EXPIRED,
  S.CANCELLED,
]);

/** Notices keyed by the creator-level outcome, not the raw submission state. */
const NOTIFY: Partial<Record<S, { title: string; body: string }>> = {
  [S.VERIFIED]: {
    title: 'Your identity is verified',
    body: 'Your identity verification is complete.',
  },
  [S.REJECTED]: {
    title: "We couldn't verify your identity",
    body: 'Review the details and try again with a valid document.',
  },
  [S.NEEDS_REVIEW]: {
    title: 'Verification under review',
    body: "We're reviewing your verification. We'll notify you when it's done.",
  },
  [S.RESUBMISSION_REQUIRED]: {
    title: 'Action needed on your verification',
    body: 'Some steps need to be redone. Continue your verification to finish.',
  },
  [S.KYC_EXPIRED]: {
    title: 'Your verification has expired',
    body: 'Please verify your identity again to keep receiving contributions.',
  },
};

/** The creator-level kycStatus each notice is only valid for. */
const NOTICE_REQUIRES: Partial<Record<S, KycStatus>> = {
  [S.VERIFIED]: KycStatus.VERIFIED,
  [S.NEEDS_REVIEW]: KycStatus.NEEDS_REVIEW,
};

const KYC_EXPIRED_REASON =
  'Your identity verification has expired. Please verify again.';

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * The only code that changes KYC state. Must be called inside a transaction.
 * Locks creator then submission (fixed order, avoids deadlocks), validates
 * the transition, then updates submission, creator, audit log and
 * notifications atomically.
 */
@Injectable()
export class KycTransitionService {
  private readonly logger = new Logger(KycTransitionService.name);

  /**
   * Lock order is ALWAYS creator, then submission. Callers must take these
   * locks before any other write that touches the submission row (including
   * inserting a row with a foreign key to it, which takes a share lock).
   * Re-locking a row already held in the same transaction is a no-op.
   */
  async lockCreator(tx: Prisma.TransactionClient, creatorId: string) {
    await tx.$queryRaw`SELECT id FROM "creator_profiles" WHERE id = ${creatorId} FOR UPDATE`;
  }

  async lockSubmission(tx: Prisma.TransactionClient, submissionId: string) {
    await tx.$queryRaw`SELECT id FROM "kyc_submissions" WHERE id = ${submissionId} FOR UPDATE`;
  }

  async transition(
    tx: Prisma.TransactionClient,
    input: TransitionInput,
  ): Promise<TransitionOutcome> {
    const ref = await tx.kycSubmission.findUnique({
      where: { id: input.submissionId },
      select: { creatorId: true },
    });
    if (!ref) {
      throw new NotFoundException({
        code: ErrorCodes.KYC_SUBMISSION_NOT_FOUND,
        message: 'KYC submission not found',
      });
    }

    await this.lockCreator(tx, ref.creatorId);
    await this.lockSubmission(tx, input.submissionId);

    const submission = await tx.kycSubmission.findUniqueOrThrow({
      where: { id: input.submissionId },
    });
    const now = new Date();
    const isAdmin = input.source === KycReviewSource.ADMIN;

    if (
      input.expectedFrom &&
      !input.expectedFrom.includes(submission.status as S)
    ) {
      if (submission.status === input.to && isAdmin) {
        // The provider's echo webhook got here first; keep attribution.
        const attributed = await this.recordReviewer(
          tx,
          submission,
          input,
          now,
        );
        return {
          changed: false,
          reason: 'same_status',
          submission: attributed,
        };
      }
      this.logger.warn(
        `KYC transition to ${input.to} for submission ${submission.id} expected ${input.expectedFrom.join('/')} but found ${submission.status}`,
      );
      return { changed: false, reason: 'unexpected_state', submission };
    }

    // Admin decisions are made against the provider's current state, so they
    // skip the stale check but advance the ordering guard: provider events
    // older than the decision must not undo it.
    const check = checkSubmissionTransition({
      from: submission.status,
      to: input.to,
      occurredAt: isAdmin ? null : input.occurredAt,
      lastProviderUpdateAt: submission.providerUpdatedAt,
    });
    const stampAt = isAdmin ? now : input.occurredAt;

    if (!check.allowed) {
      if (check.reason === 'same_status') {
        // Same state: refresh sync metadata only, never state.
        const refreshed = await tx.kycSubmission.update({
          where: { id: submission.id },
          data: {
            lastSyncedAt: now,
            ...(input.providerStatus
              ? { providerStatus: input.providerStatus }
              : {}),
            ...(input.summary
              ? { decisionSummary: toJson(input.summary) }
              : {}),
            ...(this.isNewer(stampAt, submission.providerUpdatedAt)
              ? { providerUpdatedAt: stampAt }
              : {}),
            ...(isAdmin ? this.reviewerFields(input, now) : {}),
          },
        });
        return { changed: false, reason: check.reason, submission: refreshed };
      }

      this.logger.warn(
        `Ignored KYC transition ${submission.status} -> ${input.to} for submission ${submission.id} (${check.reason}, source ${input.source})`,
      );
      return { changed: false, reason: check.reason, submission };
    }

    const summary =
      input.summary ??
      (submission.decisionSummary as unknown as KycDecisionSummary | null);

    let rejectionReason = submission.rejectionReason;
    if (input.to === S.REJECTED) {
      rejectionReason =
        input.rejectionReason ?? rejectionReasonFromWarnings(summary?.warnings);
    } else if (input.to === S.KYC_EXPIRED) {
      rejectionReason = KYC_EXPIRED_REASON;
    } else if (input.to === S.VERIFIED) {
      rejectionReason = null;
    }

    const updated = await tx.kycSubmission.update({
      where: { id: submission.id },
      data: {
        status: input.to,
        rejectionReason,
        lastSyncedAt: now,
        ...(input.providerStatus
          ? { providerStatus: input.providerStatus }
          : {}),
        ...(input.summary ? { decisionSummary: toJson(input.summary) } : {}),
        ...(this.isNewer(stampAt, submission.providerUpdatedAt)
          ? { providerUpdatedAt: stampAt }
          : {}),
        ...(FINISHED_STATUSES.has(input.to) && !submission.completedAt
          ? { completedAt: now }
          : {}),
        ...(isAdmin ? this.reviewerFields(input, now) : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: 'KYC_SUBMISSION_STATUS_CHANGED',
        resourceType: 'KYC_SUBMISSION',
        resourceId: submission.id,
        previousState: { status: submission.status },
        newState: { status: updated.status },
        metadata: {
          source: input.source,
          eventId: input.eventId ?? null,
          providerStatus: input.providerStatus ?? null,
        },
      },
    });

    const sync = await this.syncCreator(tx, updated, input);

    const notice = NOTIFY[input.to];
    const requires = NOTICE_REQUIRES[input.to];
    if (sync.isLatest && notice && (!requires || sync.kycStatus === requires)) {
      const creator = await tx.creatorProfile.findUniqueOrThrow({
        where: { id: updated.creatorId },
        select: { userId: true },
      });
      await tx.notification.create({
        data: {
          userId: creator.userId,
          type: 'KYC_UPDATE',
          title: notice.title,
          body: notice.body,
          data: { submissionId: updated.id, status: updated.status },
        },
      });
    }

    return { changed: true, submission: updated };
  }

  /**
   * Re-derives the creator's kycStatus and status from their latest
   * submission. Older submissions never affect the creator. A creator whose
   * verification was revoked (kycBlockedAt) can never become VERIFIED here.
   */
  async syncCreator(
    tx: Prisma.TransactionClient,
    submission: KycSubmission,
    input: Pick<TransitionInput, 'source' | 'actorId' | 'eventId'>,
  ): Promise<CreatorSyncResult> {
    const latest = await tx.kycSubmission.findFirst({
      where: { creatorId: submission.creatorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (latest?.id !== submission.id) {
      return { isLatest: false, kycStatus: null };
    }

    const prior = await tx.kycSubmission.findFirst({
      where: {
        creatorId: submission.creatorId,
        id: { not: submission.id },
        status: { in: [S.REJECTED, S.KYC_EXPIRED] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { status: true },
    });

    const creator = await tx.creatorProfile.findUniqueOrThrow({
      where: { id: submission.creatorId },
    });

    const kycStatus = creator.kycBlockedAt
      ? KycStatus.REJECTED
      : kycStatusForSubmission(
          submission.status,
          kycStatusFromPriorOutcome(prior?.status),
        );
    const status = creatorStatusForKyc(creator.status, kycStatus);
    const kycVerifiedAt =
      kycStatus === KycStatus.VERIFIED
        ? creator.kycStatus === KycStatus.VERIFIED && creator.kycVerifiedAt
          ? creator.kycVerifiedAt
          : new Date()
        : null;

    if (
      creator.kycStatus === kycStatus &&
      creator.status === status &&
      creator.kycVerifiedAt?.getTime() === kycVerifiedAt?.getTime()
    ) {
      return { isLatest: true, kycStatus };
    }

    await tx.creatorProfile.update({
      where: { id: creator.id },
      data: { kycStatus, status, kycVerifiedAt },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: 'CREATOR_KYC_STATUS_CHANGED',
        resourceType: 'CREATOR_PROFILE',
        resourceId: creator.id,
        previousState: { kycStatus: creator.kycStatus, status: creator.status },
        newState: { kycStatus, status },
        metadata: {
          source: input.source,
          submissionId: submission.id,
          eventId: input.eventId ?? null,
        },
      },
    });

    return { isLatest: true, kycStatus };
  }

  private reviewerFields(input: TransitionInput, now: Date) {
    return {
      reviewedById: input.actorId ?? null,
      reviewedAt: now,
      reviewNote: input.reviewNote ?? null,
    };
  }

  private recordReviewer(
    tx: Prisma.TransactionClient,
    submission: KycSubmission,
    input: TransitionInput,
    now: Date,
  ) {
    return tx.kycSubmission.update({
      where: { id: submission.id },
      data: {
        ...this.reviewerFields(input, now),
        ...(input.to === S.REJECTED && input.rejectionReason
          ? { rejectionReason: input.rejectionReason }
          : {}),
        ...(this.isNewer(now, submission.providerUpdatedAt)
          ? { providerUpdatedAt: now }
          : {}),
      },
    });
  }

  private isNewer(candidate?: Date | null, current?: Date | null): boolean {
    return !!candidate && (!current || candidate.getTime() > current.getTime());
  }
}
