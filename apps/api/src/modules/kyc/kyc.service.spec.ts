import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { KycDocumentType, KycSubmissionStatus as S } from '@buymeayard/types';
import { KycService } from './kyc.service';
import { KycAdminService } from './kyc-admin.service';
import { KycTransitionService } from './kyc-transition.service';
import { FakePrisma } from './kyc.test-utils';
import {
  emptyAdminDecisionView,
  mapDiditStatus,
} from '../../infrastructure/kyc/didit/didit.mapper';
import type {
  KycDecision,
  KycDecisionSummary,
  KycProvider,
  KycWebhookEvent,
} from '../../infrastructure/kyc/kyc-provider.interface';

const WORKFLOW = 'wf-1';

const details = {
  firstName: 'Mariam',
  lastName: 'Omiteru',
  dateOfBirth: '1995-10-12',
  country: 'NGA',
  documentType: KycDocumentType.NATIONAL_ID,
};

function makeProvider() {
  let n = 0;
  const provider = {
    providerName: 'DIDIT',
    createSession: jest.fn(async () => {
      n += 1;
      return {
        sessionId: `sess-${n}`,
        url: `https://verify.didit.me/session/${n}`,
        sessionToken: `tok-${n}`,
        providerStatus: 'Not Started',
        status: S.CREATED,
        workflowId: WORKFLOW,
      };
    }),
    deleteSession: jest.fn(async () => undefined),
    getDecision: jest.fn(async (): Promise<KycDecision> => ({
      providerStatus: 'Not Started',
      status: S.CREATED,
      summary: emptySummary(),
      adminView: emptyAdminDecisionView(),
    })),
    updateStatus: jest.fn(async () => undefined),
    verifyWebhook: jest.fn(),
  };
  return provider as typeof provider & KycProvider;
}

/** A provider approval where every check passed, as Didit sends it. */
function approvedSummary(): KycDecisionSummary {
  return {
    ...emptySummary(),
    idStatus: 'Approved',
    livenessStatus: 'Approved',
    faceMatchStatus: 'Approved',
  };
}

function emptySummary(warnings: { risk: string }[] = []): KycDecisionSummary {
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
    warnings,
  };
}

describe('KycService', () => {
  let prisma: FakePrisma;
  let provider: ReturnType<typeof makeProvider>;
  let service: KycService;
  let admin: KycAdminService;
  let config: Record<string, unknown>;
  let eventSeq = 0;

  const webhook = (
    sessionId: string,
    providerStatus: string,
    overrides: Partial<KycWebhookEvent> = {},
  ) => {
    const event: KycWebhookEvent = {
      eventId: `evt-${++eventSeq}`,
      eventType: 'status.updated',
      sessionId,
      vendorData: null,
      providerStatus,
      status: mapDiditStatus(providerStatus),
      environment: 'sandbox',
      workflowId: WORKFLOW,
      occurredAt: new Date(Date.now() + eventSeq * 1000),
      summary: providerStatus === 'Approved' ? approvedSummary() : null,
      redactedPayload: { status: providerStatus },
      ...overrides,
    };
    provider.verifyWebhook.mockReturnValueOnce({ isValid: true, event });
    return service.handleWebhook({}, Buffer.from('{}'));
  };

  beforeEach(() => {
    prisma = new FakePrisma();
    provider = makeProvider();
    config = {
      NODE_ENV: 'test',
      DIDIT_WORKFLOW_ID: WORKFLOW,
      CREATOR_FRONTEND_URL: 'https://creator.example.com/',
      KYC_MOBILE_CALLBACK_URL: 'buymeayard://kyc/complete',
      KYC_MAX_SESSIONS_PER_DAY: 5,
    };
    const configService = { get: (key: string) => config[key] };
    const transitions = new KycTransitionService();
    service = new KycService(
      prisma as never,
      configService as never,
      transitions,
      provider,
    );
    admin = new KycAdminService(
      prisma as never,
      transitions,
      provider,
      service,
    );
  });

  const start = (userId: string, dto = details, headers = {}) =>
    service.startSession(userId, dto, headers);

  describe('startSession', () => {
    it('creates a session and moves the creator to pending', async () => {
      const creator = prisma.addCreator();
      const res = await start(creator.userId);

      expect(res).toEqual({
        submissionId: prisma.submissions[0].id,
        status: S.CREATED,
        verificationUrl: 'https://verify.didit.me/session/1',
        sessionToken: 'tok-1',
        resumed: false,
      });
      expect(provider.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorData: creator.id,
          callbackUrl: 'https://creator.example.com/kyc/complete',
          expectedDetails: details,
        }),
      );
      expect(creator.kycStatus).toBe('PENDING');
      expect(creator.status).toBe('KYC_PENDING');
      expect(prisma.submissions[0].claimedDetails).toEqual(details);
    });

    it('uses the mobile deep link for mobile clients', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId, details, { 'x-client-type': 'mobile' });
      expect(provider.createSession).toHaveBeenCalledWith(
        expect.objectContaining({ callbackUrl: 'buymeayard://kyc/complete' }),
      );
    });

    it('resumes an open session with the same details without a new row', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      // Didit is idempotent per (workflow, vendor_data): same session back
      provider.createSession.mockResolvedValueOnce({
        sessionId: 'sess-1',
        url: 'https://verify.didit.me/session/1',
        sessionToken: 'tok-1',
        providerStatus: 'Not Started',
        status: S.CREATED,
        workflowId: WORKFLOW,
      });

      const res = await start(creator.userId, {
        ...details,
        firstName: ' mariam ',
      });
      expect(res.resumed).toBe(true);
      expect(prisma.submissions).toHaveLength(1);
    });

    it('replaces an untouched session when details change', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);

      await start(creator.userId, {
        ...details,
        documentType: KycDocumentType.PASSPORT,
      });

      expect(provider.getDecision).toHaveBeenCalledWith('sess-1');
      expect(provider.deleteSession).toHaveBeenCalledWith('sess-1');
      expect(prisma.submissions.map((s) => s.status)).toEqual([
        S.CANCELLED,
        S.CREATED,
      ]);
      expect(creator.kycStatus).toBe('PENDING');
    });

    it('refuses to change details while the user is mid-capture', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'In Progress',
        status: S.IN_PROGRESS,
        summary: emptySummary(),
        adminView: emptyAdminDecisionView(),
      });

      await expect(
        start(creator.userId, { ...details, lastName: 'Other' }),
      ).rejects.toMatchObject({
        response: { code: 'KYC_SESSION_IN_PROGRESS' },
      });
      expect(provider.deleteSession).not.toHaveBeenCalled();
    });

    it('never deletes a session the provider already approved (lost webhook)', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Approved',
        status: S.VERIFIED,
        summary: approvedSummary(),
        adminView: emptyAdminDecisionView(),
      });

      await expect(
        start(creator.userId, { ...details, lastName: 'Other' }),
      ).rejects.toMatchObject({ response: { code: 'KYC_ALREADY_VERIFIED' } });
      expect(provider.deleteSession).not.toHaveBeenCalled();
      expect(creator.status).toBe('ACTIVE');
    });

    it('enforces the daily attempt limit', async () => {
      config.KYC_MAX_SESSIONS_PER_DAY = 1;
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Declined');

      const err = await start(creator.userId).catch((e: HttpException) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
    });

    it('blocks verified, in-review and suspended creators', async () => {
      const verified = prisma.addCreator({
        kycStatus: 'VERIFIED',
        status: 'ACTIVE',
      });
      await expect(start(verified.userId)).rejects.toBeInstanceOf(
        ConflictException,
      );

      const review = prisma.addCreator({ kycStatus: 'NEEDS_REVIEW' });
      await expect(start(review.userId)).rejects.toMatchObject({
        response: { code: 'KYC_UNDER_REVIEW' },
      });

      const suspended = prisma.addCreator({ status: 'SUSPENDED' });
      await expect(start(suspended.userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(provider.createSession).not.toHaveBeenCalled();
    });

    it('rejects minors before calling the provider', async () => {
      const creator = prisma.addCreator();
      await expect(
        start(creator.userId, { ...details, dateOfBirth: '2015-01-01' }),
      ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
      expect(provider.createSession).not.toHaveBeenCalled();
    });

    it('surfaces provider outages without writing anything', async () => {
      const creator = prisma.addCreator();
      provider.createSession.mockRejectedValueOnce(new BadGatewayException());
      await expect(start(creator.userId)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(prisma.submissions).toHaveLength(0);
      expect(creator.kycStatus).toBe('NOT_SUBMITTED');
    });
  });

  describe('handleWebhook', () => {
    it('rejects invalid signatures', async () => {
      provider.verifyWebhook.mockReturnValueOnce({
        isValid: false,
        reason: 'signature mismatch',
      });
      await expect(
        service.handleWebhook({}, Buffer.from('{}')),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('approval activates the creator with audit trail and notification', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);

      await expect(webhook('sess-1', 'Approved')).resolves.toEqual({
        received: true,
      });

      expect(prisma.submissions[0].status).toBe(S.VERIFIED);
      expect(prisma.submissions[0].completedAt).toBeInstanceOf(Date);
      expect(creator.kycStatus).toBe('VERIFIED');
      expect(creator.status).toBe('ACTIVE');
      expect(creator.kycVerifiedAt).toBeInstanceOf(Date);
      expect(prisma.events).toHaveLength(1);
      expect(prisma.audits.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          'KYC_SUBMISSION_STATUS_CHANGED',
          'CREATOR_KYC_STATUS_CHANGED',
        ]),
      );
      expect(prisma.notifications).toEqual([
        expect.objectContaining({ userId: creator.userId, type: 'KYC_UPDATE' }),
      ]);
    });

    it('processes a duplicate event only once', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', { eventId: 'dup' });

      await expect(
        webhook('sess-1', 'Approved', { eventId: 'dup' }),
      ).resolves.toEqual({
        received: true,
        status: 'already_processed',
      });
      expect(prisma.events).toHaveLength(1);
      expect(prisma.notifications).toHaveLength(1);
    });

    it('ignores a late "In Progress" arriving after approval', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', {
        occurredAt: new Date('2026-09-27T10:05:00Z'),
      });
      await webhook('sess-1', 'In Progress', {
        occurredAt: new Date('2026-09-27T10:01:00Z'),
      });

      expect(prisma.submissions[0].status).toBe(S.VERIFIED);
      expect(creator.status).toBe('ACTIVE');
    });

    it('rejection stores a user-safe reason and keeps the creator unpublished', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Declined', {
        summary: emptySummary([{ risk: 'DOCUMENT_EXPIRED' }]),
      });

      expect(prisma.submissions[0].rejectionReason).toMatch(/expired/);
      expect(creator.kycStatus).toBe('REJECTED');
      expect(creator.status).toBe('PROFILE_CREATED');
    });

    it('never reactivates a suspended creator', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      creator.status = 'SUSPENDED';

      await webhook('sess-1', 'Approved');
      expect(creator.kycStatus).toBe('VERIFIED');
      expect(creator.status).toBe('SUSPENDED');
    });

    it('ignores events whose vendor_data does not match the submission', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await expect(
        webhook('sess-1', 'Approved', { vendorData: 'someone-else' }),
      ).resolves.toEqual({ received: true, ignored: 'vendor_mismatch' });
      expect(creator.kycStatus).toBe('PENDING');
    });

    it('adopts an unknown session only for our workflow and a known creator', async () => {
      const creator = prisma.addCreator();
      await webhook('orphan-1', 'Approved', { vendorData: creator.id });
      expect(prisma.submissions).toHaveLength(1);
      expect(creator.status).toBe('ACTIVE');

      const other = prisma.addCreator();
      await expect(
        webhook('orphan-2', 'Approved', {
          vendorData: other.id,
          workflowId: 'foreign',
        }),
      ).resolves.toEqual({ received: true, ignored: 'unknown_session' });
      expect(other.status).toBe('PROFILE_CREATED');
    });

    it('ignores sandbox events in production', async () => {
      config.NODE_ENV = 'production';
      const creator = prisma.addCreator();
      await start(creator.userId);
      await expect(
        webhook('sess-1', 'Approved', { environment: 'sandbox' }),
      ).resolves.toEqual({ received: true, ignored: 'sandbox_event' });
      expect(creator.status).toBe('KYC_PENDING');
    });

    it('ignores unrecognised provider statuses', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await expect(webhook('sess-1', 'Something New')).resolves.toEqual({
        received: true,
        ignored: 'unknown_status',
      });
      expect(creator.kycStatus).toBe('PENDING');
    });

    it('an abandoned retry restores the previous rejection', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Declined');
      await start(creator.userId);
      expect(creator.kycStatus).toBe('PENDING');

      await webhook('sess-2', 'Abandoned');
      expect(creator.kycStatus).toBe('REJECTED');
      expect(creator.status).toBe('PROFILE_CREATED');
    });
  });

  describe('getMyKyc', () => {
    it('reports status and prefills from the account name', async () => {
      const creator = prisma.addCreator();
      const res = await service.getMyKyc(creator.userId);
      expect(res).toMatchObject({
        kycStatus: 'NOT_SUBMITTED',
        contributionsEnabled: false,
        canStartSession: true,
        prefill: { firstName: 'Mariam', lastName: 'Omiteru' },
        latestSubmission: null,
      });
    });

    it('reconciles a stale pending submission with the provider', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      prisma.submissions[0].lastSyncedAt = new Date(Date.now() - 120_000);
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Approved',
        status: S.VERIFIED,
        summary: approvedSummary(),
        adminView: emptyAdminDecisionView(),
      });

      const res = await service.getMyKyc(creator.userId);
      expect(res.kycStatus).toBe('VERIFIED');
      expect(res.contributionsEnabled).toBe(true);
      expect(res.canStartSession).toBe(false);
    });

    it('still answers when the provider is down', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      prisma.submissions[0].lastSyncedAt = null;
      provider.getDecision.mockRejectedValueOnce(new BadGatewayException());
      await expect(service.getMyKyc(creator.userId)).resolves.toMatchObject({
        kycStatus: 'PENDING',
      });
    });
  });

  describe('admin review', () => {
    async function inReview() {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'In Review');
      return { creator, submission: prisma.submissions[0] };
    }

    it('approve updates the provider first, then activates the creator', async () => {
      const { creator, submission } = await inReview();
      await admin.approve(submission.id, 'admin-1', 'Looks good');

      expect(provider.updateStatus).toHaveBeenCalledWith(
        'sess-1',
        'APPROVED',
        'Looks good',
      );
      expect(submission.status).toBe(S.VERIFIED);
      expect(submission.reviewedById).toBe('admin-1');
      expect(creator.status).toBe('ACTIVE');
      expect(prisma.audits.some((a) => a.actorId === 'admin-1')).toBe(true);
    });

    it('changes nothing locally when the provider call fails', async () => {
      const { creator, submission } = await inReview();
      provider.updateStatus.mockRejectedValueOnce(new BadGatewayException());

      await expect(
        admin.approve(submission.id, 'admin-1'),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(submission.status).toBe(S.NEEDS_REVIEW);
      expect(creator.status).toBe('KYC_PENDING');
    });

    it('reject stores the admin reason for the creator', async () => {
      const { creator, submission } = await inReview();
      await admin.reject(
        submission.id,
        'admin-1',
        'Document is not legible',
        'blurry',
      );

      expect(provider.updateStatus).toHaveBeenCalledWith(
        'sess-1',
        'DECLINED',
        'blurry',
      );
      expect(submission.rejectionReason).toBe('Document is not legible');
      expect(submission.reviewNote).toBe('blurry');
      expect(creator.kycStatus).toBe('REJECTED');
    });

    it('only reviews submissions that are awaiting a decision', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await expect(
        admin.reject(prisma.submissions[0].id, 'admin-1', 'x'),
      ).rejects.toMatchObject({ response: { code: 'KYC_INVALID_TRANSITION' } });
      expect(provider.updateStatus).not.toHaveBeenCalled();
    });

    it('revoke unpublishes a verified creator', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved');

      await admin.revoke(creator.id, 'admin-1', 'Fraud investigation');
      expect(provider.updateStatus).toHaveBeenCalledWith(
        'sess-1',
        'DECLINED',
        'Fraud investigation',
      );
      expect(creator.kycStatus).toBe('REJECTED');
      expect(creator.status).toBe('PROFILE_CREATED');
      expect(creator.kycVerifiedAt).toBeNull();
    });

    it('the provider webhook echoing an admin decision is a no-op', async () => {
      const { submission } = await inReview();
      await admin.approve(submission.id, 'admin-1');
      const notifications = prisma.notifications.length;

      await webhook('sess-1', 'Approved');
      expect(submission.status).toBe(S.VERIFIED);
      expect(prisma.notifications).toHaveLength(notifications);
    });
  });

  describe('regressions from review', () => {
    async function verified() {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved');
      return creator;
    }

    it('a revoked creator cannot re-verify until unblocked', async () => {
      const creator = await verified();
      await admin.revoke(creator.id, 'admin-1', 'Fraud investigation');
      expect(creator.kycBlockedAt).toBeInstanceOf(Date);

      await expect(start(creator.userId)).rejects.toMatchObject({
        response: { code: 'KYC_BLOCKED' },
      });
      expect((await service.getMyKyc(creator.userId)).canStartSession).toBe(
        false,
      );

      await admin.unblock(creator.id, 'admin-1');
      expect(creator.kycBlockedAt).toBeNull();
      await expect(start(creator.userId)).resolves.toMatchObject({
        resumed: false,
      });
    });

    it('a provider approval after revocation never re-verifies the creator', async () => {
      const creator = await verified();
      await admin.revoke(creator.id, 'admin-1', 'Fraud investigation');

      // A reviewer (or a stale retry) re-approves the session at Didit
      await webhook('sess-1', 'Approved', {
        occurredAt: new Date(Date.now() + 60_000),
      });
      expect(creator.kycStatus).toBe('REJECTED');
      expect(creator.status).toBe('PROFILE_CREATED');
    });

    it('revoke is applied locally even when the provider is down', async () => {
      const creator = await verified();
      provider.updateStatus.mockRejectedValueOnce(new BadGatewayException());

      await admin.revoke(creator.id, 'admin-1', 'Fraud investigation');
      expect(creator.kycStatus).toBe('REJECTED');
      expect(creator.status).toBe('PROFILE_CREATED');
    });

    it('admin approval of a blocked creator is refused', async () => {
      const creator = await verified();
      await admin.revoke(creator.id, 'admin-1', 'Fraud');
      await expect(
        admin.approve(prisma.submissions[0].id, 'admin-1'),
      ).rejects.toMatchObject({ response: { code: 'KYC_BLOCKED' } });
      expect(provider.updateStatus).toHaveBeenCalledTimes(1); // revoke only
    });

    it('an admin decision on a submission that changed underneath returns 409', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'In Review');
      const submission = prisma.submissions[0];
      // Another decision lands between the admin's check and apply
      provider.updateStatus.mockImplementationOnce(async () => {
        submission.status = S.REJECTED;
      });

      await expect(
        admin.approve(submission.id, 'admin-1'),
      ).resolves.toBeDefined(); // REJECTED is an allowed start for approve
      expect(submission.status).toBe(S.VERIFIED);

      provider.updateStatus.mockImplementationOnce(async () => {
        submission.status = S.CREATED;
      });
      submission.status = S.NEEDS_REVIEW;
      await expect(
        admin.reject(submission.id, 'admin-1', 'nope'),
      ).rejects.toMatchObject({ response: { code: 'KYC_INVALID_TRANSITION' } });
    });

    it('keeps admin attribution when the provider echo arrives first', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'In Review');
      const submission = prisma.submissions[0];
      provider.updateStatus.mockImplementationOnce(async () => {
        await webhook('sess-1', 'Approved'); // echo lands before our write
      });

      await admin.approve(submission.id, 'admin-1', 'checked');
      expect(submission.status).toBe(S.VERIFIED);
      expect(submission.reviewedById).toBe('admin-1');
      expect(submission.reviewNote).toBe('checked');
    });

    it('resuming never demotes a creator Didit already approved', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      // Webhook lost: Didit already approved sess-1
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Approved',
        status: S.VERIFIED,
        summary: approvedSummary(),
        adminView: emptyAdminDecisionView(),
      });

      await expect(start(creator.userId)).rejects.toMatchObject({
        response: { code: 'KYC_ALREADY_VERIFIED' },
      });
      expect(creator.status).toBe('ACTIVE');
      expect(prisma.submissions).toHaveLength(1);
    });

    it('discards a new provider session if the old one turns out decided', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      // Pre-check says still open, then Didit hands back a new session
      // because the old one finished in between.
      provider.getDecision
        .mockResolvedValueOnce({
          providerStatus: 'In Progress',
          status: S.IN_PROGRESS,
          summary: emptySummary(),
          adminView: emptyAdminDecisionView(),
        })
        .mockResolvedValueOnce({
          providerStatus: 'Approved',
          status: S.VERIFIED,
          summary: approvedSummary(),
          adminView: emptyAdminDecisionView(),
        });

      await expect(start(creator.userId)).rejects.toMatchObject({
        response: { code: 'KYC_ALREADY_VERIFIED' },
      });
      expect(provider.deleteSession).toHaveBeenCalledWith('sess-2');
      expect(prisma.submissions).toHaveLength(1);
      expect(creator.status).toBe('ACTIVE');
    });

    it('rethrows unique violations that are not duplicate events', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      prisma.kycSubmission.update.mockRejectedValueOnce(
        (await import('./kyc.test-utils')).uniqueViolation('KycSubmission', [
          'provider',
          'providerReference',
        ]),
      );
      await expect(webhook('sess-1', 'Approved')).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('ignores a stale event even when the transition table allows it', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'In Progress', {
        occurredAt: new Date('2026-01-01T10:00:10Z'),
      });
      // IN_PROGRESS -> REJECTED is allowed, but this event is older
      await webhook('sess-1', 'Declined', {
        occurredAt: new Date('2026-01-01T10:00:05Z'),
      });
      expect(prisma.submissions[0].status).toBe(S.IN_PROGRESS);
      expect(creator.kycStatus).toBe('PENDING');
    });

    it('a stale same-status event does not overwrite newer data', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Declined', {
        occurredAt: new Date('2026-01-01T10:00:10Z'),
        summary: emptySummary([{ risk: 'NEW' }]),
      });
      await webhook('sess-1', 'Declined', {
        occurredAt: new Date('2026-01-01T10:00:05Z'),
        summary: emptySummary([{ risk: 'OLD' }]),
      });
      expect(prisma.submissions[0].decisionSummary.warnings).toEqual([
        { risk: 'NEW' },
      ]);
    });

    it('reconcile never writes the provider ordering timestamp', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      prisma.submissions[0].lastSyncedAt = null;
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'In Progress',
        status: S.IN_PROGRESS,
        summary: emptySummary(),
        adminView: emptyAdminDecisionView(),
      });
      await service.getMyKyc(creator.userId);
      expect(prisma.submissions[0].status).toBe(S.IN_PROGRESS);
      expect(prisma.submissions[0].providerUpdatedAt).toBeNull();

      // A Didit event from "now" still applies afterwards
      await webhook('sess-1', 'Approved');
      expect(creator.status).toBe('ACTIVE');
    });

    it('audit logs record the real previous state', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved');
      const audit = prisma.audits.find(
        (a) =>
          a.action === 'KYC_SUBMISSION_STATUS_CHANGED' &&
          a.newState.status === S.VERIFIED,
      );
      expect(audit?.previousState).toEqual({ status: S.CREATED });
      const creatorAudit = prisma.audits.filter(
        (a) => a.action === 'CREATOR_KYC_STATUS_CHANGED',
      );
      expect(creatorAudit.at(-1)?.previousState).toEqual({
        kycStatus: 'PENDING',
        status: 'KYC_PENDING',
      });
    });

    it('adoption returns the row startSession created meanwhile', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      // First lookup misses (race), adoption re-checks after locking
      prisma.kycSubmission.findUnique.mockResolvedValueOnce(null);
      await webhook('sess-1', 'Approved', { vendorData: creator.id });
      expect(prisma.submissions).toHaveLength(1);
      expect(creator.status).toBe('ACTIVE');
    });

    it('a suspended creator gets a neutral verified notice, never "published"', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      creator.status = 'SUSPENDED';
      await webhook('sess-1', 'Approved');
      const notices = prisma.notifications.filter((n) =>
        n.title.includes('verified'),
      );
      expect(notices).toHaveLength(1);
      expect(notices[0].body).not.toMatch(/publish|contributions/i);
      expect(creator.status).toBe('SUSPENDED');
    });
  });

  describe('required-checks policy', () => {
    const noFaceMatch = (): KycDecisionSummary => ({
      ...approvedSummary(),
      faceMatchStatus: null,
    });

    it('a provider approval missing Face Match goes to review, not verified', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', { summary: noFaceMatch() });

      const submission = prisma.submissions[0];
      expect(submission.status).toBe(S.NEEDS_REVIEW);
      expect(submission.providerStatus).toBe('Approved');
      expect(submission.decisionSummary.missingRequiredChecks).toEqual([
        'FACE_MATCH',
      ]);
      expect(creator.kycStatus).toBe('NEEDS_REVIEW');
      expect(creator.status).toBe('KYC_PENDING');
      const queue = await admin.listQueue({});
      expect(queue.data.map((s) => s.id)).toEqual([submission.id]);
    });

    it('a declined check inside an approval also goes to review', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', {
        summary: { ...approvedSummary(), livenessStatus: 'Declined' },
      });
      expect(prisma.submissions[0].status).toBe(S.NEEDS_REVIEW);
      expect(creator.status).not.toBe('ACTIVE');
    });

    it('an approval without any decision data goes to review, then a full reconcile verifies', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', { summary: null });
      expect(prisma.submissions[0].status).toBe(S.NEEDS_REVIEW);

      prisma.submissions[0].lastSyncedAt = null;
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Approved',
        status: S.VERIFIED,
        summary: approvedSummary(),
        adminView: emptyAdminDecisionView(),
      });
      await service.getMyKyc(creator.userId);
      expect(prisma.submissions[0].status).toBe(S.VERIFIED);
      expect(creator.status).toBe('ACTIVE');
    });

    it('admin approval of a held case does not re-send Approved to Didit', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', { summary: noFaceMatch() });
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Approved',
        status: S.VERIFIED,
        summary: noFaceMatch(),
        adminView: emptyAdminDecisionView(),
      });

      await admin.approve(
        prisma.submissions[0].id,
        'admin-1',
        'checked manually',
      );
      expect(provider.updateStatus).not.toHaveBeenCalled();
      expect(prisma.submissions[0].status).toBe(S.VERIFIED);
      expect(prisma.submissions[0].reviewedById).toBe('admin-1');
      expect(creator.status).toBe('ACTIVE');
    });

    it('respects a narrower KYC_REQUIRED_CHECKS', async () => {
      config.KYC_REQUIRED_CHECKS = 'ID_VERIFICATION,LIVENESS';
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Approved', { summary: noFaceMatch() });
      expect(prisma.submissions[0].status).toBe(S.VERIFIED);
      expect(creator.status).toBe('ACTIVE');
    });

    it('never affects declines', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Declined', { summary: null });
      expect(prisma.submissions[0].status).toBe(S.REJECTED);
    });
  });

  describe('PR #38 review fixes', () => {
    it('re-checks the attempt limit under the lock and discards the new session', async () => {
      config.KYC_MAX_SESSIONS_PER_DAY = 1;
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'Declined');
      // Simulate a concurrent request that passed the pre-check: the
      // fast-path count sees nothing, the in-lock count sees the real row.
      prisma.kycSubmission.count.mockResolvedValueOnce(0);

      const err = await start(creator.userId).catch((e: HttpException) => e);
      expect((err as HttpException).getStatus()).toBe(429);
      expect(prisma.submissions).toHaveLength(1);
      expect(provider.deleteSession).toHaveBeenCalledWith('sess-2');
    });

    it('recovers when the provider delete succeeds but the local cancel fails', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      // 1st transaction = the pre-branch reconcile (succeeds);
      // 2nd = the local cancel after the provider delete (fails).
      prisma.$transaction
        .mockImplementationOnce(async (fn) => fn(prisma))
        .mockRejectedValueOnce(new Error('db down'));

      // First attempt: Didit session deleted, local write fails
      await expect(
        start(creator.userId, { ...details, lastName: 'Changed' }),
      ).rejects.toThrow('db down');
      expect(prisma.submissions[0].status).toBe(S.CREATED);
      expect(provider.deleteSession).toHaveBeenCalledWith('sess-1');

      // Retry: the session is gone at Didit (404 -> no status), delete is
      // tolerated again, and the cancel completes.
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Not Found',
        status: null,
        summary: emptySummary(),
        adminView: emptyAdminDecisionView(),
      });
      await start(creator.userId, { ...details, lastName: 'Changed' });
      expect(prisma.submissions.map((r) => r.status)).toEqual([
        S.CANCELLED,
        S.CREATED,
      ]);
    });

    it.each([['SUSPENDED'], ['BANNED'], ['DEACTIVATED']])(
      'does not adopt a session for a %s creator',
      async (status) => {
        const creator = prisma.addCreator({ status });
        await expect(
          webhook('orphan-x', 'Approved', { vendorData: creator.id }),
        ).resolves.toEqual({ received: true, ignored: 'creator_ineligible' });
        expect(prisma.submissions).toHaveLength(0);
        expect(prisma.events).toHaveLength(1); // still recorded (idempotency)
        expect(prisma.audits.map((a) => a.action)).toContain(
          'KYC_EVENT_IGNORED_INELIGIBLE_CREATOR',
        );
        expect(creator.status).toBe(status);
      },
    );

    it('does not adopt a session for a blocked creator', async () => {
      const creator = prisma.addCreator({
        kycStatus: 'REJECTED',
        kycBlockedAt: new Date(),
      });
      await expect(
        webhook('orphan-y', 'Approved', { vendorData: creator.id }),
      ).resolves.toEqual({ received: true, ignored: 'creator_ineligible' });
      expect(prisma.submissions).toHaveLength(0);
      expect(creator.kycStatus).toBe('REJECTED');
    });

    it('admin detail returns the allowlisted view, never the raw payload', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      const view = {
        ...emptyAdminDecisionView(),
        status: 'Not Started',
      };
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Not Started',
        status: S.CREATED,
        summary: emptySummary(),
        adminView: view,
      });
      const detail = await admin.getDetail(prisma.submissions[0].id, 'admin-1');
      expect(detail.providerDecision).toEqual(view);
      expect(detail).not.toHaveProperty('raw');
    });

    it('admin detail self-heals a lost webhook', async () => {
      const creator = prisma.addCreator();
      await start(creator.userId);
      await webhook('sess-1', 'In Review');
      // Didit already moved on (e.g. our write failed after an admin action)
      provider.getDecision.mockResolvedValueOnce({
        providerStatus: 'Approved',
        status: S.VERIFIED,
        summary: approvedSummary(),
        adminView: emptyAdminDecisionView(),
      });

      const detail = await admin.getDetail(prisma.submissions[0].id, 'admin-1');
      expect(detail.status).toBe(S.VERIFIED);
      expect(creator.status).toBe('ACTIVE');
      expect(provider.getDecision).toHaveBeenCalledTimes(1); // no second fetch
    });
  });
});
