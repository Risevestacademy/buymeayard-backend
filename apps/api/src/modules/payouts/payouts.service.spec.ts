import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PaymentProviderRejectedError } from '../../infrastructure/payments/payment-provider.interface';
import { PayoutsService } from './payouts.service';

describe('PayoutsService', () => {
  const method = {
    id: 'pm-1',
    isDefault: true,
    status: 'ACTIVE',
    bankName: 'Guaranty Trust Bank',
    bankCode: '058',
    accountName: 'SHOSANYA ISAAC OLUWADAMILARE',
    accountIdentifier: '0123454589',
    recipientCode: 'RCP_123',
  };

  function setup(
    opts: {
      creator?: Record<string, unknown>;
      lockedCreator?: Record<string, unknown>;
      precheckBalance?: number;
      lockedEntries?: { direction: string; amount: number }[];
      method?: Record<string, unknown> | null;
      transfer?: () => Promise<unknown>;
      existingPayout?: Record<string, unknown>;
      claimCount?: number;
    } = {},
  ) {
    const creator = {
      id: 'creator-1',
      userId: 'user-1',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      ...opts.creator,
    };
    // Rows written through the mocks, so later reads see them
    const payouts = new Map<string, Record<string, unknown>>();
    const tx = {
      $queryRaw: jest.fn((strings: TemplateStringsArray) =>
        Promise.resolve(
          strings.join('').includes('nextval') ? [{ nextval: BigInt(41) }] : [],
        ),
      ),
      creatorProfile: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(opts.lockedCreator ?? creator),
      },
      ledgerEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.lockedEntries ?? [{ direction: 'CREDIT', amount: 5_000_000 }],
          ),
        create: jest.fn(),
      },
      payout: {
        create: jest.fn().mockImplementation((args) => {
          const row = { id: 'payout-1', processedAt: null, ...args.data };
          payouts.set(row.id, row);
          return Promise.resolve(row);
        }),
        updateMany: jest.fn().mockImplementation((args) => {
          const row = payouts.get(args.where.id);
          const count = opts.claimCount ?? (row ? 1 : 0);
          if (row && count) Object.assign(row, args.data);
          return Promise.resolve({ count });
        }),
        findUniqueOrThrow: jest.fn((args) =>
          Promise.resolve(payouts.get(args.where.id)),
        ),
      },
    };
    const prisma = {
      creatorProfile: { findUnique: jest.fn().mockResolvedValue(creator) },
      payout: {
        findUnique: jest.fn().mockResolvedValue(opts.existingPayout ?? null),
        findUniqueOrThrow: tx.payout.findUniqueOrThrow,
        updateMany: tx.payout.updateMany,
        count: jest.fn().mockResolvedValue(67),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const ledger = {
      getOrCreateAccount: jest
        .fn()
        .mockResolvedValue({ id: 'acct-1', currency: 'NGN' }),
      getAccountBalance: jest
        .fn()
        .mockResolvedValue(opts.precheckBalance ?? 5_000_000),
    };
    const payoutMethods = {
      getActiveMethod: jest
        .fn()
        .mockResolvedValue('method' in opts ? opts.method : method),
    };
    const provider = {
      initiateTransfer: jest.fn(
        opts.transfer ??
          (() => Promise.resolve({ status: 'PENDING', transferCode: 'TRF_1' })),
      ),
    };
    const eventEmitter = { emit: jest.fn() };
    return {
      tx,
      prisma,
      payouts,
      provider,
      eventEmitter,
      service: new PayoutsService(
        prisma as never,
        ledger as never,
        payoutMethods as never,
        provider as never,
        eventEmitter as never,
      ),
    };
  }

  describe('requestPayout', () => {
    it('reserves the amount, sends the net to the bank and marks it processing', async () => {
      const { service, tx, provider, eventEmitter } = setup();

      const result = await service.requestPayout('user-1', 4_500_000);

      expect(tx.$queryRaw).toHaveBeenCalled(); // creator row locked
      expect(tx.payout.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: 4_500_000,
          fee: 5_000,
          netAmount: 4_495_000,
          reference: expect.stringMatching(/^PYT-\d{8}-0041$/),
          payoutMethodId: 'pm-1',
          bankName: 'Guaranty Trust Bank',
          accountNumberLast4: '4589',
        }),
      });
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: 'DEBIT',
            amount: 4_500_000,
          }),
        }),
      );
      expect(provider.initiateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 4_495_000,
          recipientCode: 'RCP_123',
          reference: expect.stringMatching(/^pyt-\d{8}-0041$/),
        }),
      );
      expect(result).toMatchObject({
        status: 'IN_PROGRESS',
        netAmount: 4_495_000,
        destination: { accountNumberLast4: '4589' },
      });
      // The design only notifies on confirmed status changes
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('fails the payout and restores the balance when Paystack rejects it', async () => {
      const { service, tx, eventEmitter } = setup({
        transfer: () =>
          Promise.reject(new PaymentProviderRejectedError('Invalid recipient')),
      });

      const result = await service.requestPayout('user-1', 4_500_000);

      expect(result).toMatchObject({
        status: 'FAILED',
        breakdown: { transferred: 0, returnedToBalance: 4_500_000 },
      });
      expect(tx.ledgerEntry.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          entryType: 'PAYOUT_REVERSED',
          direction: 'CREDIT',
          amount: 4_500_000,
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payout.failed',
        expect.objectContaining({ payoutId: 'payout-1' }),
      );
    });

    it('leaves the payout pending when the transfer outcome is unknown', async () => {
      const { service, tx } = setup({
        transfer: () => Promise.reject(new Error('socket hang up')),
      });

      const result = await service.requestPayout('user-1', 4_500_000);

      expect(result.status).toBe('IN_PROGRESS');
      expect(tx.payout.updateMany).toHaveBeenCalledWith({
        where: { id: 'payout-1', status: 'REQUESTED' },
        data: { status: 'PENDING' },
      });
      expect(tx.ledgerEntry.create).toHaveBeenCalledTimes(1); // reservation only
    });

    it('returns the earlier payout for a repeated idempotency key', async () => {
      const existing = {
        id: 'payout-0',
        status: 'PROCESSING',
        amount: 4_500_000,
        fee: 5_000,
        netAmount: 4_495_000,
      };
      const { service, tx, provider } = setup({ existingPayout: existing });

      await expect(
        service.requestPayout('user-1', 4_500_000, 'key-1'),
      ).resolves.toMatchObject({ id: 'payout-0' });
      expect(tx.payout.create).not.toHaveBeenCalled();
      expect(provider.initiateTransfer).not.toHaveBeenCalled();
    });

    it('refuses amounts below the ₦1,000 minimum', async () => {
      const { service, tx } = setup();
      await expect(
        service.requestPayout('user-1', 75_000),
      ).rejects.toMatchObject({
        response: { code: 'BELOW_MINIMUM_WITHDRAWAL' },
      });
      expect(tx.payout.create).not.toHaveBeenCalled();
    });

    it('requires a verified payout account', async () => {
      const { service, tx } = setup({
        method: { ...method, recipientCode: null },
      });
      await expect(
        service.requestPayout('user-1', 4_500_000),
      ).rejects.toMatchObject({ response: { code: 'PAYOUT_METHOD_REQUIRED' } });
      expect(tx.payout.create).not.toHaveBeenCalled();
    });

    it('refuses a suspended creator even with verified KYC', async () => {
      const { service, tx } = setup({ creator: { status: 'SUSPENDED' } });
      await expect(
        service.requestPayout('user-1', 500_000),
      ).rejects.toMatchObject({ response: { code: 'CREATOR_NOT_ACTIVE' } });
      await expect(
        service.requestPayout('user-1', 500_000),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.payout.create).not.toHaveBeenCalled();
    });

    it('re-checks KYC under the lock (revoked after the pre-check)', async () => {
      const { service, tx } = setup({
        lockedCreator: { status: 'PROFILE_CREATED', kycStatus: 'REJECTED' },
      });
      await expect(
        service.requestPayout('user-1', 500_000),
      ).rejects.toMatchObject({ response: { code: 'KYC_REQUIRED' } });
      expect(tx.payout.create).not.toHaveBeenCalled();
    });

    it('re-checks the balance under the lock (concurrent payout)', async () => {
      const { service, tx } = setup({
        precheckBalance: 1_000_000,
        lockedEntries: [
          { direction: 'CREDIT', amount: 1_000_000 },
          { direction: 'DEBIT', amount: 800_000 }, // reserved by another request
        ],
      });
      await expect(
        service.requestPayout('user-1', 500_000),
      ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_FUNDS' } });
      expect(tx.payout.create).not.toHaveBeenCalled();
    });

    it.each([[0], [-1], [10.5], [Number.NaN]])(
      'rejects invalid amount %p',
      async (amount) => {
        const { service } = setup();
        await expect(
          service.requestPayout('user-1', amount),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );
  });

  describe('quote', () => {
    it.each([
      [4_500_000, 5_000, 4_495_000], // ₦45,000 → ₦50 fee
      [5_000_000, 5_000, 4_995_000], // ₦50,000 is still the lower tier
      [45_500_000, 10_000, 45_490_000], // ₦455,000 → ₦100 fee
    ])('charges the design fee for %p kobo', async (amount, fee, net) => {
      const { service } = setup({ precheckBalance: 50_000_000 });
      await expect(service.quote('user-1', amount)).resolves.toMatchObject({
        fee,
        netAmount: net,
        isValid: true,
        error: null,
      });
    });

    it('flags amounts below the minimum or above the balance', async () => {
      const { service } = setup({ precheckBalance: 4_500_000 });
      await expect(service.quote('user-1', 75_000)).resolves.toMatchObject({
        isValid: false,
        error: 'BELOW_MINIMUM',
      });
      await expect(service.quote('user-1', 45_500_000)).resolves.toMatchObject({
        isValid: false,
        error: 'EXCEEDS_BALANCE',
      });
    });
  });

  describe('applyTransferOutcome', () => {
    function withPayout(status: string, claimCount?: number) {
      const ctx = setup({ claimCount });
      ctx.payouts.set('payout-1', {
        id: 'payout-1',
        accountId: 'acct-1',
        creatorId: 'creator-1',
        status,
        amount: 4_500_000,
        fee: 5_000,
        netAmount: 4_495_000,
        currency: 'NGN',
      });
      return ctx;
    }

    it('marks success without touching the ledger', async () => {
      const { service, tx, eventEmitter } = withPayout('PROCESSING');

      await expect(
        service.applyTransferOutcome('payout-1', 'SUCCESS'),
      ).resolves.toBe(true);
      expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'payout.success',
        expect.objectContaining({ netAmount: 4_495_000 }),
      );
    });

    it('can reverse a payout that had already succeeded', async () => {
      const { service, tx } = withPayout('SUCCESS');

      await service.applyTransferOutcome('payout-1', 'REVERSED');

      expect(tx.payout.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'payout-1',
            status: { in: ['REQUESTED', 'PENDING', 'PROCESSING', 'SUCCESS'] },
          },
        }),
      );
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entryType: 'PAYOUT_REVERSED',
          amount: 4_500_000,
        }),
      });
    });

    it('does nothing for a payout already in a final state', async () => {
      const { service, tx, eventEmitter } = withPayout('FAILED', 0);

      await expect(
        service.applyTransferOutcome('payout-1', 'FAILED'),
      ).resolves.toBe(false);
      expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('listPayouts', () => {
    it('filters by the design status and sorts oldest first', async () => {
      const { service, prisma } = setup();

      const result = await service.listPayouts('user-1', {
        page: 2,
        limit: 10,
        status: 'in_progress',
        sort: 'oldest',
      });

      expect(prisma.payout.findMany).toHaveBeenCalledWith({
        where: {
          creatorId: 'creator-1',
          status: { in: ['REQUESTED', 'PENDING', 'PROCESSING'] },
        },
        orderBy: { requestedAt: 'asc' },
        skip: 10,
        take: 10,
      });
      expect(result.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 67,
        totalPages: 7,
      });
    });
  });
});
