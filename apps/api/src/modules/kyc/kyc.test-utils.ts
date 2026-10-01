/*
 * In-memory Prisma fake covering only what the KYC services use. Test-only
 * (excluded from the build via tsconfig.build.json).
 *
 * Mirrors real Prisma where it matters for correctness tests:
 * - reads and writes return copies, never live stored rows;
 * - unique violations throw P2002 with meta.target like Postgres does.
 * It does NOT model locking, rollback or isolation: those are covered by the
 * real-Postgres test in test/kyc-concurrency.e2e-spec.ts.
 */
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

let seq = 0;
const id = (prefix: string) => `${prefix}-${++seq}`;
const copy = <T extends Row | null | undefined>(row: T): T =>
  row ? { ...row } : row;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) return (cond.in as unknown[]).includes(value);
      if ('not' in cond) return value !== cond.not;
      if ('gte' in cond) return value >= cond.gte;
    }
    return value === cond;
  });
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      const [key, dir] = Object.entries(o)[0];
      if (a[key] < b[key]) return dir === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

export function uniqueViolation(modelName: string, target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { modelName, target },
  });
}

export class FakePrisma {
  users: Row[] = [];
  creators: Row[] = [];
  submissions: Row[] = [];
  events: Row[] = [];
  audits: Row[] = [];
  notifications: Row[] = [];
  // createdAt advances on every insert so ordering is deterministic. Starts
  // an hour ago so rows fall inside windows computed from Date.now().
  private clock = Date.now() - 60 * 60 * 1000;

  private tick() {
    this.clock += 1000;
    return new Date(this.clock);
  }

  /** Returns the live stored row so tests can assert on current state. */
  addCreator(overrides: Row = {}) {
    const user = {
      id: id('user'),
      email: 'c@example.com',
      name: 'Mariam Omiteru',
    };
    this.users.push(user);
    const creator = {
      id: id('creator'),
      userId: user.id,
      username: 'mariam',
      status: 'PROFILE_CREATED',
      kycStatus: 'NOT_SUBMITTED',
      kycVerifiedAt: null,
      kycBlockedAt: null,
      kycBlockedReason: null,
      ...overrides,
    };
    this.creators.push(creator);
    return creator;
  }

  $queryRaw = jest.fn(async () => []);

  $transaction = jest.fn(async (fn: (tx: FakePrisma) => unknown) => fn(this));

  kycSubmission = {
    findUnique: jest.fn(async ({ where }: Row) => {
      if (where.id) {
        return copy(this.submissions.find((s) => s.id === where.id) ?? null);
      }
      const key = where.provider_providerReference;
      return copy(
        this.submissions.find(
          (s) =>
            s.provider === key.provider &&
            s.providerReference === key.providerReference,
        ) ?? null,
      );
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: Row) => {
      const row = this.submissions.find((s) => s.id === where.id);
      if (!row) throw new Error('not found');
      return copy(row);
    }),
    findFirst: jest.fn(async ({ where, orderBy }: Row) =>
      copy(
        sortRows(
          this.submissions.filter((s) => matches(s, where)),
          orderBy,
        )[0] ?? null,
      ),
    ),
    findMany: jest.fn(async ({ where }: Row) =>
      this.submissions.filter((s) => matches(s, where)).map(copy),
    ),
    count: jest.fn(
      async ({ where }: Row) =>
        this.submissions.filter((s) => matches(s, where)).length,
    ),
    create: jest.fn(async ({ data }: Row) => {
      if (
        this.submissions.some(
          (s) =>
            s.provider === data.provider &&
            s.providerReference === data.providerReference,
        )
      ) {
        throw uniqueViolation('KycSubmission', [
          'provider',
          'providerReference',
        ]);
      }
      const row = {
        id: id('sub'),
        status: 'CREATED',
        providerStatus: null,
        providerUpdatedAt: null,
        lastSyncedAt: null,
        completedAt: null,
        decisionSummary: null,
        claimedDetails: null,
        rejectionReason: null,
        reviewedById: null,
        reviewNote: null,
        reviewedAt: null,
        environment: null,
        workflowId: null,
        createdAt: this.tick(),
        ...data,
      };
      this.submissions.push(row);
      return copy(row);
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = this.submissions.find((s) => s.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return copy(row);
    }),
  };

  creatorProfile = {
    findUnique: jest.fn(async ({ where, include }: Row) => {
      const row = this.creators.find((c) =>
        where.userId ? c.userId === where.userId : c.id === where.id,
      );
      if (!row) return null;
      return include?.user
        ? { ...row, user: copy(this.users.find((u) => u.id === row.userId)) }
        : copy(row);
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: Row) => {
      const row = this.creators.find((c) => c.id === where.id);
      if (!row) throw new Error('not found');
      return copy(row);
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = this.creators.find((c) => c.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return copy(row);
    }),
  };

  kycEvent = {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.provider_providerEventId;
      return copy(
        this.events.find(
          (e) =>
            e.provider === key.provider &&
            e.providerEventId === key.providerEventId,
        ) ?? null,
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      if (
        this.events.some(
          (e) =>
            e.provider === data.provider &&
            e.providerEventId === data.providerEventId,
        )
      ) {
        throw uniqueViolation('KycEvent', ['provider', 'providerEventId']);
      }
      const row = { id: id('evt'), ...data };
      this.events.push(row);
      return copy(row);
    }),
  };

  auditLog = {
    create: jest.fn(async ({ data }: Row) => {
      this.audits.push({ ...data });
      return copy(data);
    }),
  };

  notification = {
    create: jest.fn(async ({ data }: Row) => {
      this.notifications.push({ ...data });
      return copy(data);
    }),
  };
}
