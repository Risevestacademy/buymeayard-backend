import { BadRequestException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';

describe('PayoutsService admin actions', () => {
  const payout = {
    id: 'p-1',
    creatorId: 'cr-1',
    accountId: 'acc-1',
    status: 'REQUESTED',
    amount: 100_000,
    fee: 5_000,
    netAmount: 95_000,
    currency: 'NGN',
    providerReference: 'pyt-1',
    payoutMethod: { recipientCode: 'RCP_1' },
  };

  function setup(
    opts: { payout?: Record<string, unknown> | null; transfer?: unknown } = {},
  ) {
    const row = 'payout' in opts ? opts.payout : payout;
    const tx = {
      payout: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ ...payout, status: 'CANCELLED' }),
      },
      ledgerEntry: { create: jest.fn() },
    };
    const prisma = {
      payout: {
        findUnique: jest.fn().mockResolvedValue(row),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
        updateMany: jest.fn(),
      },
      creatorProfile: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'u-1' }),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const provider = {
      verifyTransfer: jest
        .fn()
        .mockResolvedValue(opts.transfer ?? { status: 'NOT_FOUND' }),
      initiateTransfer: jest
        .fn()
        .mockResolvedValue({ status: 'PENDING', transferCode: 'TRF_1' }),
    };
    const eventEmitter = { emit: jest.fn() };
    const service = new PayoutsService(
      prisma as never,
      {} as never,
      {} as never,
      provider as never,
      eventEmitter as never,
      {} as never,
    );
    return { service, prisma, tx, provider, eventEmitter };
  }

  describe('cancelPayout', () => {
    it('cancels a payout Paystack never saw and returns the reserved amount', async () => {
      const { service, tx, eventEmitter } = setup();

      const result = await service.cancelPayout('p-1', 'Creator asked');

      expect(tx.payout.updateMany).toHaveBeenCalledWith({
        where: { id: 'p-1', status: 'REQUESTED' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          failureReason: 'Creator asked',
        }),
      });
      expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entryType: 'PAYOUT_REVERSED',
          direction: 'CREDIT',
          amount: 100_000,
        }),
      });
      expect(result.status).toBe('CANCELLED');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('refuses when Paystack already has the transfer', async () => {
      const { service, tx } = setup({ transfer: { status: 'PENDING' } });
      await expect(service.cancelPayout('p-1', 'x')).rejects.toThrow(
        'Reconcile it',
      );
      expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    });

    it('refuses a payout that is not REQUESTED', async () => {
      const { service } = setup({
        payout: { ...payout, status: 'PROCESSING' },
      });
      await expect(service.cancelPayout('p-1', 'x')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('retryTransfer', () => {
    it('sends the transfer again with the same reference when Paystack has no record', async () => {
      const { service, provider, prisma } = setup({
        payout: { ...payout, status: 'PENDING' },
      });

      await service.retryTransfer('p-1');

      expect(prisma.payout.updateMany).toHaveBeenCalledWith({
        where: { id: 'p-1', status: { in: ['REQUESTED', 'PENDING'] } },
        data: { status: 'PROCESSING', providerTransferCode: 'TRF_1' },
      });
      expect(provider.initiateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: 'pyt-1',
          amount: 95_000,
          recipientCode: 'RCP_1',
        }),
      );
    });

    it('does not send twice when Paystack already has the transfer', async () => {
      const { service, provider } = setup({
        payout: { ...payout, status: 'PENDING' },
        transfer: { status: 'PENDING' },
      });

      await service.retryTransfer('p-1');

      expect(provider.initiateTransfer).not.toHaveBeenCalled();
    });

    it('refuses a payout that already finished', async () => {
      const { service, provider } = setup({
        payout: { ...payout, status: 'SUCCESS' },
      });
      await expect(service.retryTransfer('p-1')).rejects.toThrow(
        'cannot be retried',
      );
      expect(provider.initiateTransfer).not.toHaveBeenCalled();
    });
  });
});
