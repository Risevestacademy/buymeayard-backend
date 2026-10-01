import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { KycSubmission } from '@prisma/client';
import {
  KycReviewSource,
  KycStatus,
  KycSubmissionStatus as S,
} from '@buymeayard/types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { KYC_PROVIDER } from '../../infrastructure/kyc/kyc-provider.interface';
import type {
  KycManualDecision,
  KycProvider,
} from '../../infrastructure/kyc/kyc-provider.interface';
import { ErrorCodes } from '../../common/errors/error-codes';
import { KycTransitionService } from './kyc-transition.service';
import { KycQueueQueryDto } from './dto/admin-kyc.dto';

const CREATOR_SELECT = {
  id: true,
  slug: true,
  status: true,
  kycStatus: true,
  kycVerifiedAt: true,
  kycBlockedAt: true,
  kycBlockedReason: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class KycAdminService {
  private readonly logger = new Logger(KycAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: KycTransitionService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  async listQueue(query: KycQueueQueryDto) {
    const status = query.status ?? S.NEEDS_REVIEW;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [total, items] = await Promise.all([
      this.prisma.kycSubmission.count({ where: { status } }),
      this.prisma.kycSubmission.findMany({
        where: { status },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], // oldest first
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          status: true,
          providerStatus: true,
          rejectionReason: true,
          createdAt: true,
          completedAt: true,
          creator: { select: CREATOR_SELECT },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getDetail(submissionId: string, adminId: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
      include: {
        creator: { select: CREATOR_SELECT },
        events: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            eventType: true,
            providerStatus: true,
            createdAt: true,
          },
        },
      },
    });
    if (!submission) throw this.notFound();

    // Live provider decision with short-lived media URLs. Never persisted.
    let providerDecision: unknown = null;
    let providerError: string | null = null;
    if (submission.providerReference) {
      try {
        providerDecision = (
          await this.provider.getDecision(submission.providerReference)
        ).raw;
      } catch {
        providerError = 'Could not load the live decision from the provider';
      }
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'KYC_SUBMISSION_VIEWED',
        resourceType: 'KYC_SUBMISSION',
        resourceId: submission.id,
      },
    });

    return { ...submission, providerDecision, providerError };
  }

  async approve(submissionId: string, adminId: string, note?: string) {
    const submission = await this.getLatestOrThrow(submissionId);
    this.assertStatus(submission, [S.NEEDS_REVIEW, S.REJECTED], 'approved');

    const creator = await this.prisma.creatorProfile.findUniqueOrThrow({
      where: { id: submission.creatorId },
      select: { kycBlockedAt: true },
    });
    if (creator.kycBlockedAt) {
      throw new ConflictException({
        code: ErrorCodes.KYC_BLOCKED,
        message:
          'This creator is blocked from verification. Unblock them first.',
      });
    }

    await this.decideWithProvider(
      submission,
      'APPROVED',
      note || 'Approved by admin',
    );
    return this.applyAdminTransition(submission, S.VERIFIED, adminId, {
      expectedFrom: [S.NEEDS_REVIEW, S.REJECTED],
      reviewNote: note,
    });
  }

  async reject(
    submissionId: string,
    adminId: string,
    reason: string,
    note?: string,
  ) {
    const submission = await this.getLatestOrThrow(submissionId);
    this.assertStatus(submission, [S.NEEDS_REVIEW], 'rejected');

    await this.decideWithProvider(submission, 'DECLINED', note || reason);
    return this.applyAdminTransition(submission, S.REJECTED, adminId, {
      expectedFrom: [S.NEEDS_REVIEW],
      rejectionReason: reason,
      reviewNote: note,
    });
  }

  /**
   * Revokes a verification and blocks re-verification until an admin lifts
   * the block. Local-first on purpose: cutting a creator off must not depend
   * on the provider being reachable. The provider is told afterwards,
   * best-effort; even if it still says Approved, the block keeps the creator
   * unverified.
   */
  async revoke(
    creatorId: string,
    adminId: string,
    reason: string,
    note?: string,
  ) {
    const revoked = await this.prisma.$transaction(async (tx) => {
      await this.transitions.lockCreator(tx, creatorId);
      const creator = await tx.creatorProfile.findUnique({
        where: { id: creatorId },
        select: { id: true, kycStatus: true, kycBlockedAt: true },
      });
      if (!creator) {
        throw new NotFoundException({
          code: ErrorCodes.CREATOR_NOT_FOUND,
          message: 'Creator not found',
        });
      }

      const latest = await tx.kycSubmission.findFirst({
        where: { creatorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (
        creator.kycBlockedAt ||
        creator.kycStatus !== KycStatus.VERIFIED ||
        latest?.status !== S.VERIFIED
      ) {
        throw new ConflictException({
          code: ErrorCodes.KYC_INVALID_TRANSITION,
          message: 'Creator does not have an active verification to revoke',
        });
      }

      await tx.creatorProfile.update({
        where: { id: creatorId },
        data: { kycBlockedAt: new Date(), kycBlockedReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'KYC_BLOCKED',
          resourceType: 'CREATOR_PROFILE',
          resourceId: creatorId,
          metadata: { reason, note: note ?? null },
        },
      });

      const outcome = await this.transitions.transition(tx, {
        submissionId: latest.id,
        to: S.REJECTED,
        expectedFrom: [S.VERIFIED],
        source: KycReviewSource.ADMIN,
        actorId: adminId,
        rejectionReason: reason,
        reviewNote: note ?? null,
      });
      if (!outcome.changed) {
        throw new ConflictException({
          code: ErrorCodes.KYC_INVALID_TRANSITION,
          message:
            'The submission changed while you were reviewing it. Refresh and try again.',
        });
      }
      return outcome.submission;
    });

    if (revoked.providerReference) {
      await this.provider
        .updateStatus(revoked.providerReference, 'DECLINED', note || reason)
        .catch((err) =>
          this.logger.error(
            `Revoked submission ${revoked.id} locally but failed to decline it at the provider: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }
    return revoked;
  }

  /** Lifts a revocation block so the creator can verify again. */
  async unblock(creatorId: string, adminId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.transitions.lockCreator(tx, creatorId);
      const creator = await tx.creatorProfile.findUnique({
        where: { id: creatorId },
        select: { id: true, kycBlockedAt: true, kycBlockedReason: true },
      });
      if (!creator) {
        throw new NotFoundException({
          code: ErrorCodes.CREATOR_NOT_FOUND,
          message: 'Creator not found',
        });
      }
      if (!creator.kycBlockedAt) {
        throw new ConflictException({
          code: ErrorCodes.KYC_INVALID_TRANSITION,
          message: 'Creator is not blocked',
        });
      }

      const updated = await tx.creatorProfile.update({
        where: { id: creatorId },
        data: { kycBlockedAt: null, kycBlockedReason: null },
        select: CREATOR_SELECT,
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'KYC_UNBLOCKED',
          resourceType: 'CREATOR_PROFILE',
          resourceId: creatorId,
          previousState: { kycBlockedReason: creator.kycBlockedReason },
          metadata: { note: note ?? null },
        },
      });
      return updated;
    });
  }

  /**
   * Provider first: if it fails nothing changes locally. If the provider
   * succeeds but our write fails, the provider's status webhook re-applies it.
   */
  private async decideWithProvider(
    submission: KycSubmission,
    decision: KycManualDecision,
    comment: string,
  ) {
    if (!submission.providerReference) {
      throw new ConflictException({
        code: ErrorCodes.KYC_INVALID_TRANSITION,
        message: 'Submission has no provider session',
      });
    }
    // Didit rejects a status update to the status it already has. That
    // happens when our required-checks policy held back a provider
    // "Approved" for review: the admin's approval then only applies locally.
    const current = await this.provider.getDecision(
      submission.providerReference,
    );
    const target = decision === 'APPROVED' ? S.VERIFIED : S.REJECTED;
    if (current.status === target) return;

    await this.provider.updateStatus(
      submission.providerReference,
      decision,
      comment,
    );
  }

  private async applyAdminTransition(
    submission: KycSubmission,
    to: S,
    adminId: string,
    extra: {
      expectedFrom: S[];
      rejectionReason?: string;
      reviewNote?: string;
    },
  ) {
    const outcome = await this.prisma.$transaction((tx) =>
      this.transitions.transition(tx, {
        submissionId: submission.id,
        to,
        expectedFrom: extra.expectedFrom,
        source: KycReviewSource.ADMIN,
        actorId: adminId,
        rejectionReason: extra.rejectionReason ?? null,
        reviewNote: extra.reviewNote ?? null,
      }),
    );

    if (!outcome.changed && outcome.reason !== 'same_status') {
      this.logger.error(
        `Admin ${adminId} decision ${to} on submission ${submission.id} was not applied locally (${outcome.reason})`,
      );
      throw new ConflictException({
        code: ErrorCodes.KYC_INVALID_TRANSITION,
        message:
          'The submission changed while you were reviewing it. Refresh and try again.',
      });
    }
    return outcome.submission;
  }

  private async getLatestOrThrow(submissionId: string) {
    const submission = await this.prisma.kycSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw this.notFound();

    const latest = await this.prisma.kycSubmission.findFirst({
      where: { creatorId: submission.creatorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (latest?.id !== submission.id) {
      throw new ConflictException({
        code: ErrorCodes.KYC_INVALID_TRANSITION,
        message: 'Only the creator’s most recent submission can be reviewed',
      });
    }
    return submission;
  }

  private assertStatus(
    submission: KycSubmission,
    allowed: S[],
    action: string,
  ) {
    if (!allowed.includes(submission.status as S)) {
      throw new ConflictException({
        code: ErrorCodes.KYC_INVALID_TRANSITION,
        message: `A ${submission.status.toLowerCase()} submission cannot be ${action}`,
      });
    }
  }

  private notFound() {
    return new NotFoundException({
      code: ErrorCodes.KYC_SUBMISSION_NOT_FOUND,
      message: 'KYC submission not found',
    });
  }
}
