import { KycSubmissionStatus as S } from '@buymeayard/types';
import { KycService } from './kyc.service';
import { KycTransitionService } from './kyc-transition.service';
import { KycExpiryService } from './kyc-expiry.service';
import { FakePrisma } from './kyc.test-utils';
import { emptyAdminDecisionView } from '../../infrastructure/kyc/didit/didit.mapper';
import type {
  KycDecision,
  KycDecisionSummary,
  KycProvider,
} from '../../infrastructure/kyc/kyc-provider.interface';

const WORKFLOW = 'wf-1';

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
      providerStatus: 'Not Found',
      status: null,
      summary: emptySummary(),
      adminView: emptyAdminDecisionView(),
    })),
    updateStatus: jest.fn(async () => undefined),
    verifyWebhook: jest.fn(),
  };
  return provider as typeof provider & KycProvider;
}

describe('KycExpiryService', () => {
  let prisma: FakePrisma;
  let provider: ReturnType<typeof makeProvider>;
  let kyc: KycService;
  let service: KycExpiryService;
  let config: Record<string, unknown>;

  beforeEach(() => {
    prisma = new FakePrisma();
    provider = makeProvider();
    config = {
      NODE_ENV: 'test',
      DIDIT_WORKFLOW_ID: WORKFLOW,
      KYC_MAX_SESSIONS_PER_DAY: 5,
      KYC_SESSION_TTL_MINUTES: 30,
    };
    const configService = { get: (key: string) => config[key] };
    const transitions = new KycTransitionService();
    kyc = new KycService(
      prisma as never,
      configService as never,
      transitions,
      provider,
    );
    service = new KycExpiryService(
      prisma as never,
      configService as never,
      kyc,
    );
  });

  async function openSession() {
    const creator = prisma.addCreator();
    await kyc.startSession(creator.userId, {}, {});
    return creator;
  }

  it('expires open submissions past the inactivity window', async () => {
    const creator = await openSession();
    prisma.submissions[0].createdAt = new Date(Date.now() - 31 * 60_000);

    await service.handleExpiry();

    expect(prisma.submissions[0].status).toBe(S.EXPIRED);
    expect(creator.kycStatus).toBe('NOT_SUBMITTED');
    expect(provider.deleteSession).toHaveBeenCalledWith('sess-1');
  });

  it('leaves recent open submissions alone', async () => {
    const creator = await openSession();

    await service.handleExpiry();

    expect(prisma.submissions[0].status).toBe(S.CREATED);
    expect(creator.kycStatus).toBe('PENDING');
    expect(provider.deleteSession).not.toHaveBeenCalled();
  });

  it('never touches finished submissions', async () => {
    const creator = await openSession();
    prisma.submissions[0].status = S.VERIFIED;
    prisma.submissions[0].createdAt = new Date(Date.now() - 31 * 60_000);

    await service.handleExpiry();

    expect(prisma.submissions[0].status).toBe(S.VERIFIED);
    expect(creator.kycStatus).toBe('PENDING');
    expect(provider.deleteSession).not.toHaveBeenCalled();
  });
});
