import { ForbiddenException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService.initializePayment contribution gate', () => {
  function setup(creatorStatus: string) {
    const prisma = {
      support: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'support-1',
          status: 'CREATED',
          totalAmount: 500_000,
          currency: 'NGN',
          supporter: { email: 's@example.com' },
          creator: { status: creatorStatus },
        }),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn().mockResolvedValue({ id: 'payment-1' }),
        update: jest.fn(),
      },
    };
    const provider = {
      providerName: 'PAYSTACK',
      initializePayment: jest.fn().mockResolvedValue({
        providerReference: 'ref-1',
        authorizationUrl: 'https://checkout',
      }),
    };
    const eventEmitter = { emit: jest.fn() };
    return {
      prisma,
      provider,
      eventEmitter,
      service: new PaymentsService(
        prisma as never,
        provider as never,
        {} as never,
        eventEmitter as never,
        {} as never,
      ),
    };
  }

  it('refuses checkout when the creator is no longer active', async () => {
    const { service, prisma, provider } = setup('PROFILE_CREATED');
    await expect(
      service.initializePayment('support-1', 's@example.com'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('initializes checkout for an active creator', async () => {
    const { service, provider } = setup('ACTIVE');
    await expect(
      service.initializePayment('support-1', 's@example.com'),
    ).resolves.toMatchObject({ paymentId: 'payment-1' });
    expect(provider.initializePayment).toHaveBeenCalled();
  });
});

describe('PaymentsService.handleWebhook transfer events', () => {
  function setup(opts: { existingEvent?: boolean; payout?: unknown } = {}) {
    const prisma = {
      paymentEvent: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.existingEvent ? { id: 'evt' } : null),
        create: jest.fn(),
      },
    };
    const provider = {
      providerName: 'PAYSTACK',
      verifyWebhookSignature: jest.fn().mockResolvedValue({ isValid: true }),
    };
    const payouts = {
      findByProviderReference: jest
        .fn()
        .mockResolvedValue('payout' in opts ? opts.payout : { id: 'payout-1' }),
      applyTransferOutcome: jest.fn().mockResolvedValue(true),
    };
    const service = new PaymentsService(
      prisma as never,
      provider as never,
      {} as never,
      { emit: jest.fn() } as never,
      payouts as never,
    );
    return { service, prisma, payouts };
  }

  const event = (type: string) => ({
    event: type,
    data: { id: 9001, reference: 'pyt-20250925-0041' },
  });

  it.each([
    ['transfer.success', 'SUCCESS'],
    ['transfer.failed', 'FAILED'],
    ['transfer.reversed', 'REVERSED'],
  ])('applies %s to the matching payout', async (type, outcome) => {
    const { service, prisma, payouts } = setup();

    await service.handleWebhook('sig', event(type), 'raw');

    expect(payouts.findByProviderReference).toHaveBeenCalledWith(
      'pyt-20250925-0041',
    );
    expect(payouts.applyTransferOutcome).toHaveBeenCalledWith(
      'payout-1',
      outcome,
    );
    expect(prisma.paymentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payoutId: 'payout-1',
        providerEventId: `${type}:9001`,
      }),
    });
  });

  it('keys events by type so failed then reversed are both processed', async () => {
    const { service, prisma } = setup();

    await service.handleWebhook('sig', event('transfer.reversed'), 'raw');

    expect(prisma.paymentEvent.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerEventId: {
          provider: 'PAYSTACK',
          providerEventId: 'transfer.reversed:9001',
        },
      },
    });
  });

  it('skips events it has already processed', async () => {
    const { service, payouts } = setup({ existingEvent: true });

    await expect(
      service.handleWebhook('sig', event('transfer.success'), 'raw'),
    ).resolves.toEqual({ status: 'already_processed' });
    expect(payouts.applyTransferOutcome).not.toHaveBeenCalled();
  });

  it('ignores transfers that are not ours', async () => {
    const { service, prisma, payouts } = setup({ payout: null });

    await service.handleWebhook('sig', event('transfer.success'), 'raw');

    expect(payouts.applyTransferOutcome).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });
});
