import { PayoutsReconciler } from './payouts.reconciler';

describe('PayoutsReconciler', () => {
  function setup(
    transferStatus: string,
    payout: Record<string, unknown> = {},
    claimCount = 1,
  ) {
    const stale = {
      id: 'payout-1',
      providerReference: 'pyt-20250925-0041',
      status: 'PROCESSING',
      delayNotifiedAt: null,
      ...payout,
    };
    const prisma = {
      payout: {
        findMany: jest.fn().mockResolvedValue([stale]),
        updateMany: jest.fn().mockResolvedValue({ count: claimCount }),
      },
    };
    const payoutsService = {
      applyTransferOutcome: jest.fn().mockResolvedValue(true),
      emitPayoutEvent: jest.fn(),
    };
    const provider = {
      verifyTransfer: jest.fn().mockResolvedValue({ status: transferStatus }),
    };
    return {
      prisma,
      payoutsService,
      reconciler: new PayoutsReconciler(
        prisma as never,
        payoutsService as never,
        provider as never,
      ),
    };
  }

  it.each(['SUCCESS', 'FAILED', 'REVERSED'])(
    'settles a payout whose %s webhook was missed',
    async (status) => {
      const { reconciler, payoutsService } = setup(status);
      await reconciler.reconcileStalePayouts();
      expect(payoutsService.applyTransferOutcome).toHaveBeenCalledWith(
        'payout-1',
        status,
      );
    },
  );

  it('fails a payout that never reached Paystack', async () => {
    const { reconciler, payoutsService } = setup('NOT_FOUND');
    await reconciler.reconcileStalePayouts();
    expect(payoutsService.applyTransferOutcome).toHaveBeenCalledWith(
      'payout-1',
      'FAILED',
      'The transfer could not be started.',
    );
  });

  it('sends the delayed notice once for a payout still pending', async () => {
    const { reconciler, prisma, payoutsService } = setup('PENDING');
    await reconciler.reconcileStalePayouts();
    expect(prisma.payout.updateMany).toHaveBeenCalledWith({
      where: { id: 'payout-1', delayNotifiedAt: null },
      data: { delayNotifiedAt: expect.any(Date) },
    });
    expect(payoutsService.emitPayoutEvent).toHaveBeenCalledWith(
      'payout.delayed',
      expect.objectContaining({ id: 'payout-1' }),
    );
  });

  it('does not repeat the delayed notice', async () => {
    const { reconciler, payoutsService } = setup('PENDING', {
      delayNotifiedAt: new Date(),
    });
    await reconciler.reconcileStalePayouts();
    expect(payoutsService.emitPayoutEvent).not.toHaveBeenCalled();
  });

  it('lets only one instance send the delayed notice', async () => {
    const { reconciler, payoutsService } = setup('PENDING', {}, 0);
    await reconciler.reconcileStalePayouts();
    expect(payoutsService.emitPayoutEvent).not.toHaveBeenCalled();
  });
});
