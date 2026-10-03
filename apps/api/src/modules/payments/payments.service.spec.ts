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
    return {
      prisma,
      provider,
      service: new PaymentsService(
        prisma as never,
        provider as never,
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
