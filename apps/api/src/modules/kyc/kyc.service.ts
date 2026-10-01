import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycSubmission, Prisma } from '@prisma/client';
import type { IncomingHttpHeaders } from 'http';
import {
  CreatorStatus,
  KycDocumentType,
  KycReviewSource,
  KycStatus,
  KycStatusResponse,
  KycSubmissionStatus as S,
  StartKycSessionResponse,
} from '@buymeayard/types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { KYC_PROVIDER } from '../../infrastructure/kyc/kyc-provider.interface';
import type {
  KycDecisionSummary,
  KycExpectedDetails,
  KycProvider,
  KycWebhookEvent,
} from '../../infrastructure/kyc/kyc-provider.interface';
import { ErrorCodes } from '../../common/errors/error-codes';
import { isMobileRequest } from '../../common/utils/client-detection.util';
import { KYC_CHECKS, parseKycChecks } from '../../config/env.validation';
import { KycTransitionService } from './kyc-transition.service';
import {
  missingRequiredChecks,
  OPEN_SUBMISSION_STATUSES,
  PROTECTED_CREATOR_STATUSES,
  RECONCILABLE_STATUSES,
} from './kyc-state';

const DEFAULT_REQUIRED_CHECKS = KYC_CHECKS.join(',');

function emptySummary(): KycDecisionSummary {
  return {
    documentType: null,
    issuingState: null,
    documentNumberLast4: null,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    idStatus: null,
    livenessStatus: null,
    livenessScore: null,
    faceMatchStatus: null,
    faceMatchScore: null,
    warnings: [],
  };
}
import { validateDateOfBirth } from './kyc-validation';
import { StartKycSessionDto } from './dto/start-kyc-session.dto';

const RECONCILE_AFTER_MS = 60_000;
const SUPPORTED_WEBHOOK_TYPES = new Set(['status.updated', 'data.updated']);

type CreatorWithUser = Prisma.CreatorProfileGetPayload<{
  include: { user: { select: { email: true; name: true } } };
}>;

/** True for a unique-constraint violation that involves `field`. */
function isUniqueViolationOn(err: unknown, field: string): boolean {
  if (
    !(err instanceof Prisma.PrismaClientKnownRequestError) ||
    err.code !== 'P2002'
  ) {
    return false;
  }
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) return target.includes(field);
  return typeof target === 'string' && target.includes(field);
}

export type WebhookResult =
  | { received: true }
  | { received: true; status: 'already_processed' }
  | { received: true; ignored: string };

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly transitions: KycTransitionService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider,
  ) {}

  // ---------------------------------------------------------------------------
  // Creator flows
  // ---------------------------------------------------------------------------

  async startSession(
    userId: string,
    dto: StartKycSessionDto,
    headers: IncomingHttpHeaders,
  ): Promise<StartKycSessionResponse> {
    const creator = await this.getCreatorOrThrow(userId);
    this.assertCanVerify(creator);

    const dobError = validateDateOfBirth(dto.dateOfBirth);
    if (dobError) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: dobError,
      });
    }

    const claimed: KycExpectedDetails = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      dateOfBirth: dto.dateOfBirth,
      country: dto.country,
      documentType: dto.documentType,
    };

    let latest = await this.findLatestSubmission(creator.id);

    // Sync an open attempt with the provider before deciding anything: a lost
    // webhook could mean it is already in progress, approved or declined.
    if (latest && OPEN_SUBMISSION_STATUSES.has(latest.status)) {
      latest = await this.reconcileSubmission(latest);
      this.assertCanVerify(await this.getCreatorOrThrow(userId));
    }

    if (latest && OPEN_SUBMISSION_STATUSES.has(latest.status)) {
      if (this.sameDetails(latest.claimedDetails, claimed)) {
        return this.openSession(creator, claimed, headers, latest);
      }

      // Details changed: only a session the user has not started may be
      // replaced.
      if (latest.status !== S.CREATED) {
        throw new ConflictException({
          code: ErrorCodes.KYC_SESSION_IN_PROGRESS,
          message:
            'A verification is already in progress. Finish it or wait for it to expire before changing your details.',
        });
      }

      await this.assertAttemptLimit(creator.id);
      await this.cancelSubmission(latest);
    } else {
      await this.assertAttemptLimit(creator.id);
    }

    return this.openSession(creator, claimed, headers, null);
  }

  async getMyKyc(userId: string): Promise<KycStatusResponse> {
    let creator = await this.getCreatorOrThrow(userId);
    let latest = await this.findLatestSubmission(creator.id);

    if (latest && this.shouldReconcile(latest)) {
      try {
        latest = await this.reconcileSubmission(latest);
        creator = await this.getCreatorOrThrow(userId);
      } catch (err) {
        // Status reads must still work when the provider is down.
        this.logger.warn(
          `KYC reconcile failed for submission ${latest.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    const claimed = this.parseClaimed(latest?.claimedDetails);
    const [nameFirst, ...nameRest] = (creator.user.name || '')
      .trim()
      .split(/\s+/);

    return {
      kycStatus: creator.kycStatus as KycStatus,
      creatorStatus: creator.status as CreatorStatus,
      contributionsEnabled: creator.status === CreatorStatus.ACTIVE,
      canStartSession:
        !PROTECTED_CREATOR_STATUSES.has(creator.status) &&
        !creator.kycBlockedAt &&
        creator.kycStatus !== KycStatus.VERIFIED &&
        creator.kycStatus !== KycStatus.NEEDS_REVIEW,
      prefill: {
        firstName: claimed?.firstName ?? (nameFirst || null),
        lastName: claimed?.lastName ?? (nameRest.join(' ') || null),
      },
      latestSubmission: latest
        ? {
            id: latest.id,
            status: latest.status as S,
            documentType: claimed?.documentType ?? null,
            createdAt: latest.createdAt.toISOString(),
            completedAt: latest.completedAt?.toISOString() ?? null,
            rejectionReason: latest.rejectionReason,
          }
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook
  // ---------------------------------------------------------------------------

  async handleWebhook(
    headers: IncomingHttpHeaders,
    rawBody: Buffer | undefined,
  ): Promise<WebhookResult> {
    const verification = this.provider.verifyWebhook(headers, rawBody);
    if (!verification.isValid) {
      this.logger.warn(`Rejected KYC webhook: ${verification.reason}`);
      throw new UnauthorizedException({
        code: ErrorCodes.WEBHOOK_VERIFICATION_FAILED,
        message: 'Invalid webhook signature',
      });
    }

    const event = verification.event;
    if (!SUPPORTED_WEBHOOK_TYPES.has(event.eventType) || !event.sessionId) {
      return { received: true, ignored: 'unsupported_event' };
    }
    if (this.isProduction() && event.environment === 'sandbox') {
      this.logger.warn(
        `Ignored sandbox KYC webhook ${event.eventId} in production`,
      );
      return { received: true, ignored: 'sandbox_event' };
    }
    if (!event.status) {
      this.logger.warn(
        `KYC webhook ${event.eventId} has unrecognised status "${event.providerStatus}"`,
      );
      return { received: true, ignored: 'unknown_status' };
    }

    const isDuplicate = async (tx: Prisma.TransactionClient) =>
      !!(await tx.kycEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: this.provider.providerName,
            providerEventId: event.eventId,
          },
        },
        select: { id: true },
      }));

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (await isDuplicate(tx)) {
          return { received: true, status: 'already_processed' } as const;
        }

        const submission =
          (await tx.kycSubmission.findUnique({
            where: {
              provider_providerReference: {
                provider: this.provider.providerName,
                providerReference: event.sessionId!,
              },
            },
          })) ?? (await this.adoptSession(tx, event));

        if (
          submission &&
          event.vendorData &&
          event.vendorData !== submission.creatorId
        ) {
          this.logger.error(
            `KYC webhook ${event.eventId} vendor_data does not match submission ${submission.id}; ignoring`,
          );
          return { received: true, ignored: 'vendor_mismatch' } as const;
        }

        // Take locks in the canonical order before any write that touches the
        // submission row (the event insert's foreign key takes a share lock).
        if (submission) {
          await this.transitions.lockCreator(tx, submission.creatorId);
          await this.transitions.lockSubmission(tx, submission.id);
          // A concurrent delivery may have committed while we waited.
          if (await isDuplicate(tx)) {
            return { received: true, status: 'already_processed' } as const;
          }
        }

        await tx.kycEvent.create({
          data: {
            provider: this.provider.providerName,
            providerEventId: event.eventId,
            submissionId: submission?.id ?? null,
            eventType: event.eventType,
            providerStatus: event.providerStatus,
            payload: event.redactedPayload as Prisma.InputJsonValue,
          },
        });

        if (!submission) {
          this.logger.warn(
            `KYC webhook ${event.eventId} for unknown session ${event.sessionId}`,
          );
          return { received: true, ignored: 'unknown_session' } as const;
        }

        if (event.environment && event.environment !== submission.environment) {
          await tx.kycSubmission.update({
            where: { id: submission.id },
            data: { environment: event.environment },
          });
        }

        const outcome = this.applyCheckPolicy(
          submission,
          event.status!,
          event.summary,
        );
        await this.transitions.transition(tx, {
          submissionId: submission.id,
          to: outcome.to,
          source: KycReviewSource.WEBHOOK,
          providerStatus: event.providerStatus,
          occurredAt: event.occurredAt,
          summary: outcome.summary,
          eventId: event.eventId,
        });

        return { received: true } as const;
      });
    } catch (err) {
      // A concurrent delivery of the same event won the insert race. Any
      // other unique violation is a real failure: rethrow so Didit retries.
      if (isUniqueViolationOn(err, 'providerEventId')) {
        return { received: true, status: 'already_processed' };
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Pulls the provider's current decision and applies it. The decision
   * endpoint carries no event timestamp, so this passes no occurredAt: the
   * stale-event guard compares provider timestamps only, and the transition
   * table still blocks regressions.
   */
  async reconcileSubmission(submission: KycSubmission): Promise<KycSubmission> {
    if (!submission.providerReference) return submission;

    const decision = await this.provider.getDecision(
      submission.providerReference,
    );
    if (!decision.status) {
      this.logger.warn(
        `Provider returned unrecognised status "${decision.providerStatus}" for submission ${submission.id}`,
      );
      return submission;
    }

    const policy = this.applyCheckPolicy(
      submission,
      decision.status,
      decision.summary,
    );
    const outcome = await this.prisma.$transaction((tx) =>
      this.transitions.transition(tx, {
        submissionId: submission.id,
        to: policy.to,
        source: KycReviewSource.RECONCILE,
        providerStatus: decision.providerStatus,
        summary: policy.summary,
      }),
    );
    return outcome.submission;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Required-checks policy for provider outcomes (not admin decisions): a
   * provider "Approved" is only accepted when every check in
   * KYC_REQUIRED_CHECKS is individually Approved. Otherwise the case goes to
   * admin review, so a misconfigured workflow (e.g. Face Match removed in the
   * Console) can never auto-verify anyone.
   */
  private applyCheckPolicy(
    submission: Pick<KycSubmission, 'id' | 'decisionSummary'>,
    to: S,
    summary: KycDecisionSummary | null | undefined,
  ): { to: S; summary: KycDecisionSummary | null } {
    if (to !== S.VERIFIED) return { to, summary: summary ?? null };

    const base =
      summary ??
      (submission.decisionSummary as unknown as KycDecisionSummary | null);
    const required = parseKycChecks(
      this.configService.get<string>('KYC_REQUIRED_CHECKS') ??
        DEFAULT_REQUIRED_CHECKS,
    );
    const missing = missingRequiredChecks(base, required);
    if (missing.length === 0) {
      return {
        to,
        summary: summary ? { ...summary, missingRequiredChecks: [] } : null,
      };
    }

    this.logger.warn(
      `Provider approved submission ${submission.id} without required checks [${missing.join(', ')}]; sending to admin review`,
    );
    return {
      to: S.NEEDS_REVIEW,
      summary: { ...(base ?? emptySummary()), missingRequiredChecks: missing },
    };
  }

  private async openSession(
    creator: CreatorWithUser,
    claimed: KycExpectedDetails,
    headers: IncomingHttpHeaders,
    resumeOf: KycSubmission | null,
  ): Promise<StartKycSessionResponse> {
    const callbackUrl = isMobileRequest(headers)
      ? this.configService.get<string>('KYC_MOBILE_CALLBACK_URL') ||
        'buymeayard://kyc/complete'
      : `${(this.configService.get<string>('CREATOR_FRONTEND_URL') || 'http://localhost:3001').replace(/\/+$/, '')}/kyc/complete`;

    // Didit returns the existing unfinished session for the same
    // (workflow, vendor_data), so this call also serves resumes.
    const session = await this.provider.createSession({
      vendorData: creator.id,
      callbackUrl,
      email: creator.user.email,
      expectedDetails: claimed,
      metadata: { creatorId: creator.id },
    });

    if (resumeOf && resumeOf.providerReference !== session.sessionId) {
      // The provider finished our open session in the meantime. Sync it, and
      // if that decided the outcome, discard the new session instead of
      // letting it supersede (and demote) the result.
      this.logger.warn(
        `Provider returned a new session while resuming submission ${resumeOf.id}; reconciling the old one`,
      );
      await this.reconcileSubmission(resumeOf);
      const refreshed = await this.prisma.creatorProfile.findUniqueOrThrow({
        where: { id: creator.id },
      });
      try {
        this.assertCanVerify(refreshed);
      } catch (err) {
        await this.provider.deleteSession(session.sessionId).catch(() => {
          this.logger.error(
            `Failed to delete superseded session ${session.sessionId}`,
          );
        });
        throw err;
      }
    }

    const { submission, resumed } = await this.prisma.$transaction(
      async (tx) => {
        await this.transitions.lockCreator(tx, creator.id);

        const existing = await tx.kycSubmission.findUnique({
          where: {
            provider_providerReference: {
              provider: this.provider.providerName,
              providerReference: session.sessionId,
            },
          },
        });
        if (existing) {
          if (existing.creatorId !== creator.id) {
            this.logger.error(
              `Provider session ${session.sessionId} belongs to another creator`,
            );
            throw new HttpException(
              {
                code: ErrorCodes.KYC_PROVIDER_ERROR,
                message: 'Unable to start verification. Please try again.',
              },
              HttpStatus.BAD_GATEWAY,
            );
          }
          // A row adopted from a webhook has no claimed details yet.
          if (!existing.claimedDetails) {
            const filled = await tx.kycSubmission.update({
              where: { id: existing.id },
              data: {
                claimedDetails: claimed as unknown as Prisma.InputJsonValue,
              },
            });
            return { submission: filled, resumed: true };
          }
          return { submission: existing, resumed: true };
        }

        const created = await tx.kycSubmission.create({
          data: {
            creatorId: creator.id,
            provider: this.provider.providerName,
            providerReference: session.sessionId,
            providerStatus: session.providerStatus,
            status: S.CREATED,
            workflowId: session.workflowId ?? null,
            claimedDetails: claimed as unknown as Prisma.InputJsonValue,
            lastSyncedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: creator.userId,
            action: 'KYC_SESSION_CREATED',
            resourceType: 'KYC_SUBMISSION',
            resourceId: created.id,
            newState: { status: created.status },
            metadata: { source: KycReviewSource.SYSTEM },
          },
        });

        await this.transitions.syncCreator(tx, created, {
          source: KycReviewSource.SYSTEM,
          actorId: creator.userId,
        });

        // An adopted session may already be past "Not Started".
        if (session.status && session.status !== S.CREATED) {
          const policy = this.applyCheckPolicy(created, session.status, null);
          const outcome = await this.transitions.transition(tx, {
            submissionId: created.id,
            to: policy.to,
            source: KycReviewSource.RECONCILE,
            providerStatus: session.providerStatus,
            summary: policy.summary,
          });
          return { submission: outcome.submission, resumed: false };
        }

        return { submission: created, resumed: false };
      },
    );

    return {
      submissionId: submission.id,
      status: submission.status as S,
      verificationUrl: session.url,
      sessionToken: session.sessionToken,
      resumed,
    };
  }

  private async cancelSubmission(submission: KycSubmission) {
    if (submission.providerReference) {
      await this.provider.deleteSession(submission.providerReference);
    }
    await this.prisma.$transaction((tx) =>
      this.transitions.transition(tx, {
        submissionId: submission.id,
        to: S.CANCELLED,
        source: KycReviewSource.SYSTEM,
      }),
    );
  }

  /**
   * Records a session we have no row for (e.g. our write failed after the
   * provider created it), but only if it is ours: known creator + our workflow.
   */
  private async adoptSession(
    tx: Prisma.TransactionClient,
    event: KycWebhookEvent,
  ): Promise<KycSubmission | null> {
    const workflowId = this.configService.get<string>('DIDIT_WORKFLOW_ID');
    if (!event.vendorData || !workflowId || event.workflowId !== workflowId) {
      return null;
    }
    const creator = await tx.creatorProfile.findUnique({
      where: { id: event.vendorData },
      select: { id: true },
    });
    if (!creator) return null;

    await this.transitions.lockCreator(tx, creator.id);

    // startSession may have recorded it while we waited for the lock.
    const existing = await tx.kycSubmission.findUnique({
      where: {
        provider_providerReference: {
          provider: this.provider.providerName,
          providerReference: event.sessionId!,
        },
      },
    });
    if (existing) return existing;

    this.logger.warn(
      `Adopting unknown KYC session ${event.sessionId} for creator ${creator.id}`,
    );
    return tx.kycSubmission.create({
      data: {
        creatorId: creator.id,
        provider: this.provider.providerName,
        providerReference: event.sessionId,
        providerStatus: event.providerStatus,
        status: S.CREATED,
        workflowId: event.workflowId,
        environment: event.environment,
        lastSyncedAt: new Date(),
      },
    });
  }

  private async assertAttemptLimit(creatorId: string) {
    const max = this.configService.get<number>('KYC_MAX_SESSIONS_PER_DAY') || 5;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await this.prisma.kycSubmission.count({
      where: { creatorId, createdAt: { gte: since } },
    });
    if (count >= max) {
      throw new HttpException(
        {
          code: ErrorCodes.KYC_ATTEMPT_LIMIT_REACHED,
          message:
            'You have reached the maximum number of verification attempts for today. Please try again tomorrow.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private assertCanVerify(creator: {
    status: string;
    kycStatus: string;
    kycBlockedAt: Date | null;
  }) {
    if (PROTECTED_CREATOR_STATUSES.has(creator.status)) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Your creator account is not eligible for verification',
      });
    }
    if (creator.kycBlockedAt) {
      throw new ForbiddenException({
        code: ErrorCodes.KYC_BLOCKED,
        message:
          'Identity verification is unavailable for this account. Please contact support.',
      });
    }
    if (creator.kycStatus === KycStatus.VERIFIED) {
      throw new ConflictException({
        code: ErrorCodes.KYC_ALREADY_VERIFIED,
        message: 'Your identity is already verified',
      });
    }
    if (creator.kycStatus === KycStatus.NEEDS_REVIEW) {
      throw new ConflictException({
        code: ErrorCodes.KYC_UNDER_REVIEW,
        message: 'Your verification is under review',
      });
    }
  }

  private shouldReconcile(submission: KycSubmission): boolean {
    if (!RECONCILABLE_STATUSES.has(submission.status)) return false;
    if (!submission.providerReference) return false;
    const last = submission.lastSyncedAt?.getTime() ?? 0;
    return Date.now() - last > RECONCILE_AFTER_MS;
  }

  private async getCreatorOrThrow(userId: string): Promise<CreatorWithUser> {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found. Complete onboarding first.',
      });
    }
    return creator;
  }

  private findLatestSubmission(creatorId: string) {
    return this.prisma.kycSubmission.findFirst({
      where: { creatorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  private parseClaimed(
    value: Prisma.JsonValue | undefined,
  ): KycExpectedDetails | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const v = value as Record<string, unknown>;
    if (
      typeof v.firstName !== 'string' ||
      typeof v.lastName !== 'string' ||
      typeof v.dateOfBirth !== 'string' ||
      typeof v.country !== 'string' ||
      !Object.values(KycDocumentType).includes(
        v.documentType as KycDocumentType,
      )
    ) {
      return null;
    }
    return v as unknown as KycExpectedDetails;
  }

  private sameDetails(
    stored: Prisma.JsonValue,
    claimed: KycExpectedDetails,
  ): boolean {
    const prev = this.parseClaimed(stored);
    if (!prev) return false;
    const norm = (s: string) => s.trim().toLowerCase();
    return (
      norm(prev.firstName) === norm(claimed.firstName) &&
      norm(prev.lastName) === norm(claimed.lastName) &&
      prev.dateOfBirth === claimed.dateOfBirth &&
      prev.country === claimed.country &&
      prev.documentType === claimed.documentType
    );
  }

  private isProduction() {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }
}
