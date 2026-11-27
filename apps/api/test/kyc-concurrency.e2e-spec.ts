/**
 * KYC concurrency against a REAL Postgres. Opt-in: set KYC_DB_TEST_URL to a
 * throwaway, fully migrated database (it writes test rows). Example:
 *
 *   docker exec buymeayard-postgres createdb -U postgres kyc_verify
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kyc_verify \
 *     pnpm --filter @buymeayard/api exec prisma migrate deploy
 *   KYC_DB_TEST_URL=postgresql://postgres:postgres@localhost:5432/kyc_verify \
 *     pnpm --filter @buymeayard/api test:e2e -- kyc-concurrency
 *
 * Covers what the in-memory unit fake cannot: row locks, deadlocks, unique
 * constraints under concurrency and transaction rollback. Didit is stubbed.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { KycDocumentType, KycSubmissionStatus as S } from '@buymeayard/types';
import { KycService } from '../src/modules/kyc/kyc.service';
import { KycTransitionService } from '../src/modules/kyc/kyc-transition.service';
import {
  emptyAdminDecisionView,
  mapDiditStatus,
} from '../src/infrastructure/kyc/didit/didit.mapper';
import type {
  KycDecisionSummary,
  KycProvider,
  KycWebhookEvent,
} from '../src/infrastructure/kyc/kyc-provider.interface';

const url = process.env.KYC_DB_TEST_URL;

/** A provider approval where every required check passed. */
const APPROVED_SUMMARY: KycDecisionSummary = {
  documentType: 'Identity Card',
  issuingState: 'NGA',
  documentNumberLast4: '1234',
  firstName: 'Test',
  lastName: 'User',
  dateOfBirth: '1990-01-01',
  idStatus: 'Approved',
  livenessStatus: 'Approved',
  livenessScore: 99,
  faceMatchStatus: 'Approved',
  faceMatchScore: 95,
  warnings: [],
};
const describeDb = url ? describe : describe.skip;

describeDb('KYC concurrency (real Postgres)', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let service: KycService;
  let nextEvent: KycWebhookEvent | null = null;
  const openSessions = new Map<string, string>();

  const provider: KycProvider = {
    providerName: 'DIDIT',
    // Didit is idempotent per vendor_data while a session is unfinished
    async createSession({ vendorData }) {
      await new Promise((r) => setTimeout(r, 10));
      if (!openSessions.has(vendorData)) {
        openSessions.set(vendorData, `sess-${randomUUID()}`);
      }
      const id = openSessions.get(vendorData)!;
      return {
        sessionId: id,
        url: `https://verify.test/${id}`,
        sessionToken: 'token',
        providerStatus: 'Not Started',
        status: S.CREATED,
        workflowId: 'wf',
      };
    },
    async deleteSession() {},
    async updateStatus() {},
    async getDecision() {
      return {
        providerStatus: 'Not Started',
        status: S.CREATED,
        summary: null as never,
        adminView: emptyAdminDecisionView(),
      };
    },
    verifyWebhook: () =>
      nextEvent
        ? { isValid: true, event: nextEvent }
        : { isValid: false, reason: 'no event' },
  };

  const dto = {
    firstName: 'Test',
    lastName: 'User',
    dateOfBirth: '1990-01-01',
    country: 'NGA',
    documentType: KycDocumentType.PASSPORT,
  };

  function webhook(sessionId: string, status: string, occurredAt = new Date()) {
    const event: KycWebhookEvent = {
      eventId: `evt-${randomUUID()}`,
      eventType: 'status.updated',
      sessionId,
      vendorData: null,
      providerStatus: status,
      status: mapDiditStatus(status),
      environment: 'sandbox',
      workflowId: 'wf',
      occurredAt,
      summary: status === 'Approved' ? APPROVED_SUMMARY : null,
      redactedPayload: { status },
    };
    return deliver(event);
  }

  function deliver(event: KycWebhookEvent) {
    // Bind the event to this call (deliveries run concurrently)
    const scoped = Object.create(service) as KycService;
    Object.assign(scoped, {
      provider: {
        ...provider,
        verifyWebhook: () => ({ isValid: true, event }),
      },
    });
    return scoped.handleWebhook({}, Buffer.from('{}'));
  }

  async function newCreator() {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@test.local`, name: 'Test User' },
    });
    return prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug: `t${randomUUID().slice(0, 12)}`,
        status: 'PROFILE_CREATED',
      },
    });
  }

  const sessionOf = async (creatorId: string) =>
    (
      await prisma.kycSubmission.findFirstOrThrow({
        where: { creatorId },
        orderBy: { createdAt: 'desc' },
      })
    ).providerReference!;

  beforeAll(() => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    const config: Record<string, unknown> = {
      NODE_ENV: 'test',
      DIDIT_WORKFLOW_ID: 'wf',
      KYC_MAX_SESSIONS_PER_DAY: 100,
      CREATOR_FRONTEND_URL: 'http://localhost:3001',
    };
    service = new KycService(
      prisma as never,
      { get: (k: string) => config[k] } as never,
      new KycTransitionService(),
      provider,
    );
  });

  afterAll(async () => {
    nextEvent = null;
    await prisma.$disconnect();
  });

  it('concurrent session starts create exactly one submission', async () => {
    const creator = await newCreator();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.startSession(creator.userId, dto, {}),
      ),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(
      await prisma.kycSubmission.count({ where: { creatorId: creator.id } }),
    ).toBe(1);
  });

  it('the same event delivered concurrently is processed once', async () => {
    const creator = await newCreator();
    await service.startSession(creator.userId, dto, {});
    const sessionId = await sessionOf(creator.id);
    const event: KycWebhookEvent = {
      eventId: `evt-${randomUUID()}`,
      eventType: 'status.updated',
      sessionId,
      vendorData: null,
      providerStatus: 'Approved',
      status: S.VERIFIED,
      environment: 'sandbox',
      workflowId: 'wf',
      occurredAt: new Date(),
      summary: APPROVED_SUMMARY,
      redactedPayload: {},
    };

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => deliver(event)),
    );
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(
      await prisma.kycEvent.count({
        where: { providerEventId: event.eventId },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId: creator.userId } }),
    ).toBe(1);
    const updated = await prisma.creatorProfile.findUniqueOrThrow({
      where: { id: creator.id },
    });
    expect([updated.status, updated.kycStatus]).toEqual(['ACTIVE', 'VERIFIED']);
  });

  it('conflicting events racing never deadlock and the newest wins', async () => {
    for (let i = 0; i < 5; i++) {
      const creator = await newCreator();
      await service.startSession(creator.userId, dto, {});
      const sessionId = await sessionOf(creator.id);
      const now = Date.now();
      const results = await Promise.allSettled([
        webhook(sessionId, 'In Progress', new Date(now - 5000)),
        webhook(sessionId, 'Approved', new Date(now)),
        webhook(sessionId, 'In Progress', new Date(now - 4000)),
      ]);
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      const submission = await prisma.kycSubmission.findFirstOrThrow({
        where: { creatorId: creator.id },
      });
      expect(submission.status).toBe(S.VERIFIED);
    }
  });

  it('a webhook racing new session starts does not deadlock', async () => {
    const creator = await newCreator();
    await service.startSession(creator.userId, dto, {});
    const sessionId = await sessionOf(creator.id);
    await webhook(sessionId, 'Declined');
    openSessions.delete(creator.id); // Declined = finished at the provider

    const results = await Promise.allSettled([
      service.startSession(creator.userId, dto, {}),
      webhook(sessionId, 'Declined'),
      service.startSession(creator.userId, dto, {}),
    ]);
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
    expect(
      await prisma.kycSubmission.count({ where: { creatorId: creator.id } }),
    ).toBe(2);
  });

  it('the database itself rejects ACTIVE without VERIFIED and unknown statuses', async () => {
    const creator = await newCreator();
    await expect(
      prisma.creatorProfile.update({
        where: { id: creator.id },
        data: { status: 'ACTIVE' },
      }),
    ).rejects.toThrow(/creator_profiles_active_requires_verified/);
    await expect(
      prisma.creatorProfile.update({
        where: { id: creator.id },
        data: { kycStatus: 'BOGUS' },
      }),
    ).rejects.toThrow(/creator_profiles_kyc_status_check/);
    // Verifying and activating together is allowed
    await expect(
      prisma.creatorProfile.update({
        where: { id: creator.id },
        data: { status: 'ACTIVE', kycStatus: 'VERIFIED' },
      }),
    ).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('no ACTIVE creator exists without VERIFIED kyc', async () => {
    expect(
      await prisma.creatorProfile.count({
        where: { status: 'ACTIVE', NOT: { kycStatus: 'VERIFIED' } },
      }),
    ).toBe(0);
  });
});
