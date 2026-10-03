import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';

describe('PayoutsService.requestPayout', () => {
  function setup(opts: {
    creator?: Record<string, unknown>;
    lockedCreator?: Record<string, unknown>;
    precheckBalance?: number;
    lockedEntries?: { direction: string; amount: number }[];
  }) {
    const creator = {
      id: 'creator-1',
      status: 'ACTIVE',
      kycStatus: 'VERIFIED',
      payoutMethods: [{ id: 'pm-1', isDefault: true }],
      ...opts.creator,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      creatorProfile: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue(opts.lockedCreator ?? creator),
      },
      ledgerEntry: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            opts.lockedEntries ?? [{ direction: 'CREDIT', amount: 100_000 }],
          ),
        create: jest.fn(),
      },
      payout: { create: jest.fn().mockResolvedValue({ id: 'payout-1' }) },
    };
    const prisma = {
      creatorProfile: { findUnique: jest.fn().mockResolvedValue(creator) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const ledger = {
      getOrCreateAccount: jest.fn().mockResolvedValue({ id: 'acct-1' }),
      getAccountBalance: jest
        .fn()
        .mockResolvedValue(opts.precheckBalance ?? 100_000),
    };
    return {
      tx,
      service: new PayoutsService(prisma as never, ledger as never),
    };
  }

  it('reserves funds for a verified, active creator', async () => {
    const { service, tx } = setup({});
    await expect(service.requestPayout('user-1', 50_000)).resolves.toEqual({
      id: 'payout-1',
    });
    expect(tx.$queryRaw).toHaveBeenCalled(); // creator row locked
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'DEBIT', amount: 50_000 }),
      }),
    );
  });

  it('refuses a suspended creator even with verified KYC', async () => {
    const { service, tx } = setup({ creator: { status: 'SUSPENDED' } });
    await expect(service.requestPayout('user-1', 50_000)).rejects.toMatchObject(
      { response: { code: 'CREATOR_NOT_ACTIVE' } },
    );
    await expect(
      service.requestPayout('user-1', 50_000),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.payout.create).not.toHaveBeenCalled();
  });

  it('re-checks KYC under the lock (revoked after the pre-check)', async () => {
    const { service, tx } = setup({
      lockedCreator: { status: 'PROFILE_CREATED', kycStatus: 'REJECTED' },
    });
    await expect(service.requestPayout('user-1', 50_000)).rejects.toMatchObject(
      { response: { code: 'KYC_REQUIRED' } },
    );
    expect(tx.payout.create).not.toHaveBeenCalled();
  });

  it('re-checks the balance under the lock (concurrent payout)', async () => {
    const { service, tx } = setup({
      precheckBalance: 100_000,
      lockedEntries: [
        { direction: 'CREDIT', amount: 100_000 },
        { direction: 'DEBIT', amount: 80_000 }, // reserved by another request
      ],
    });
    await expect(service.requestPayout('user-1', 50_000)).rejects.toMatchObject(
      { response: { code: 'INSUFFICIENT_FUNDS' } },
    );
    expect(tx.payout.create).not.toHaveBeenCalled();
  });

  it.each([[0], [-1], [10.5], [Number.NaN]])(
    'rejects invalid amount %p',
    async (amount) => {
      const { service } = setup({});
      await expect(
        service.requestPayout('user-1', amount),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
