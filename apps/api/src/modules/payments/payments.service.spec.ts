import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService.initializePayment contribution gate', () => {
  function setup(
    creatorStatus: string,
    support: Record<string, unknown> = {
      supporter: { email: 's@example.com' },
    },
  ) {
    const prisma = {
      support: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'support-1',
          status: 'CREATED',
          totalAmount: 500_000,
          currency: 'NGN',
          ...support,
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

  it('lets a guest pay with the email they gave on the intent', async () => {
    const { service, provider } = setup('ACTIVE', {
      supporter: null,
      guestEmail: 'guest@example.com',
    });
    await service.initializePayment('support-1');
    expect(provider.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'guest@example.com' }),
    );
  });

  it('prefers an email sent with the initialize call', async () => {
    const { service, provider } = setup('ACTIVE', {
      supporter: null,
      guestEmail: 'guest@example.com',
    });
    await service.initializePayment('support-1', 'other@example.com');
    expect(provider.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'other@example.com' }),
    );
  });
});

describe('PaymentsService checkout callback and status', () => {
  function setup(support: Record<string, unknown> | null) {
    const prisma = {
      support: {
        findUnique: jest.fn().mockResolvedValue(
          support && {
            id: 'support-1',
            status: 'CREATED',
            totalAmount: 500_000,
            currency: 'NGN',
            guestEmail: null,
            creator: { status: 'ACTIVE' },
            ...support,
          },
        ),
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
    return {
      prisma,
      provider,
      service: new PaymentsService(
        prisma as never,
        provider as never,
        {} as never,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
      ),
    };
  }

  it('sends the supporter back to the callback page with the support id', async () => {
    process.env.FRONTEND_URL = 'https://buymeayard.com';
    const { service, provider } = setup({});
    await service.initializePayment(
      'support-1',
      undefined,
      'https://buymeayard.com/adeola/thanks',
    );
    expect(provider.initializePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl: 'https://buymeayard.com/adeola/thanks?supportId=support-1',
      }),
    );
  });

  it('refuses a callback page on another site before creating a payment', async () => {
    process.env.FRONTEND_URL = 'https://buymeayard.com';
    const { service, prisma } = setup({});
    await expect(
      service.initializePayment('support-1', undefined, 'https://evil.com/x'),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('reports a paid gift with the thank-you message', async () => {
    const { service } = setup({
      status: 'PAID',
      items: [
        {
          quantity: 1.5,
          materialNameSnapshot: 'Adire',
          creatorMaterial: {
            materialId: 'mat-adire',
            material: {
              color: '#7F3516',
              thumbnailSmallUrl: 'https://cdn/adire-sm.png',
              imageUrl: null,
            },
          },
        },
      ],
      creator: { creatorName: 'Adeola', thankYouMessage: ' Thanks! ' },
    });
    await expect(service.getSupportStatus('support-1')).resolves.toMatchObject({
      paid: true,
      status: 'PAID',
      amount: 500_000,
      yards: 1.5,
      material: {
        id: 'mat-adire',
        name: 'Adire',
        color: '#7F3516',
        thumbnailUrl: 'https://cdn/adire-sm.png',
        quantity: 1.5,
      },
      materialName: 'Adire',
      thankYouMessage: 'Thanks!',
    });
  });

  it('is not paid while the webhook is still pending', async () => {
    const { service } = setup({
      status: 'PAYMENT_PENDING',
      items: [],
      creator: { creatorName: 'Adeola', thankYouMessage: null },
    });
    const res = await service.getSupportStatus('support-1');
    expect(res.paid).toBe(false);
    expect(res.thankYouMessage).toContain('Thank you');
  });

  it('404s for an unknown support', async () => {
    const { service } = setup(null);
    await expect(service.getSupportStatus('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
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
      {} as never,
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

describe('PaymentsService.handleWebhook refund events', () => {
  function setup() {
    const prisma = {
      paymentEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      payment: { findFirst: jest.fn().mockResolvedValue({ id: 'pay-1' }) },
    };
    const provider = {
      providerName: 'PAYSTACK',
      verifyWebhookSignature: jest.fn().mockResolvedValue({ isValid: true }),
    };
    const refunds = { applyProviderEvent: jest.fn().mockResolvedValue(true) };
    const service = new PaymentsService(
      prisma as never,
      provider as never,
      {} as never,
      { emit: jest.fn() } as never,
      {} as never,
      refunds as never,
    );
    return { service, prisma, refunds };
  }

  it.each([
    ['refund.processed', 'PROCESSED'],
    ['refund.failed', 'FAILED'],
    ['refund.processing', 'PROCESSING'],
  ])(
    'applies %s to the refund of the original payment',
    async (type, status) => {
      const { service, refunds, prisma } = setup();

      await service.handleWebhook(
        'sig',
        { event: type, data: { id: 55, transaction_reference: 'ref-1' } },
        'raw',
      );

      expect(refunds.applyProviderEvent).toHaveBeenCalledWith(
        'ref-1',
        status,
        '55',
        undefined,
      );
      expect(prisma.paymentEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          paymentId: 'pay-1',
          providerEventId: `${type}:55`,
        }),
      });
    },
  );
});
