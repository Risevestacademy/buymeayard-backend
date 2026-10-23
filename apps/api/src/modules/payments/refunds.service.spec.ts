import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentProviderRejectedError } from '../../infrastructure/payments/payment-provider.interface';
import { RefundsService } from './refunds.service';

describe('RefundsService', () => {
  const support = {
    id: 'sup-1',
    status: 'PAID',
    creatorId: 'cr-1',
    creatorAmount: 9_000,
    platformFee: 1_000,
    payment: {
      id: 'pay-1',
      status: 'SUCCESS',
      amount: 10_000,
      currency: 'NGN',
      providerReference: 'ref-1',
    },
  };

  function setup(
    opts: {
      support?: unknown;
      balance?: number;
      existingRefund?: unknown;
      refundResult?: unknown;
      refundError?: Error;
    } = {},
  ) {
    const tx = {
      $queryRaw: jest.fn(),
      refund: {
        findFirst: jest.fn().mockResolvedValue(opts.existingRefund ?? null),
        create: jest.fn().mockResolvedValue({
          id: 'ref-row',
          paymentId: 'pay-1',
          amount: 10_000,
          currency: 'NGN',
          status: 'PENDING',
          creatorDebit: 9_000,
          platformDebit: 1_000,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ref-row',
          paymentId: 'pay-1',
          currency: 'NGN',
          creatorDebit: 9_000,
          platformDebit: 1_000,
          payment: { supportId: 'sup-1', support: { creatorId: 'cr-1' } },
        }),
      },
      ledgerEntry: { createMany: jest.fn() },
      payment: { update: jest.fn() },
      support: { update: jest.fn() },
      account: {
        findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'acc' }),
      },
    };
    const prisma = {
      support: {
        findUnique: jest
          .fn()
          .mockResolvedValue('support' in opts ? opts.support : support),
      },
      refund: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'ref-row' }),
      },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const ledger = {
      getOrCreateAccount: jest.fn().mockResolvedValue({ id: 'acc' }),
      getAccountBalance: jest.fn().mockResolvedValue(opts.balance ?? 50_000),
    };
    const provider = {
      refundPayment: jest.fn(() =>
        opts.refundError
          ? Promise.reject(opts.refundError)
          : Promise.resolve(
              opts.refundResult ?? {
                status: 'PROCESSING',
                providerRefundId: '77',
              },
            ),
      ),
    };
    return {
      tx,
      prisma,
      provider,
      service: new RefundsService(
        prisma as never,
        ledger as never,
        provider as never,
      ),
    };
  }

  const options = { adminId: 'admin-1', reason: 'Duplicate charge' };

  it('debits creator and platform, refunds through Paystack and waits for the webhook', async () => {
    const { service, tx, provider, prisma } = setup();

    await service.initiateRefund('sup-1', options);

    expect(tx.ledgerEntry.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          direction: 'DEBIT',
          amount: 9_000,
          entryType: 'REFUND',
        }),
        expect.objectContaining({
          direction: 'DEBIT',
          amount: 1_000,
          entryType: 'REFUND',
        }),
      ],
    });
    expect(provider.refundPayment).toHaveBeenCalledWith({
      paymentReference: 'ref-1',
      amount: 10_000,
      reason: 'Duplicate charge',
    });
    expect(prisma.refund.update).toHaveBeenCalledWith({
      where: { id: 'ref-row' },
      data: { status: 'PROCESSING', providerReference: '77' },
    });
  });

  it('marks the payment and contribution refunded when Paystack answers processed', async () => {
    const { service, tx } = setup({
      refundResult: { status: 'PROCESSED', providerRefundId: '9' },
    });

    await service.initiateRefund('sup-1', options);

    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: 'REFUNDED' },
    });
    expect(tx.support.update).toHaveBeenCalledWith({
      where: { id: 'sup-1' },
      data: { status: 'REFUNDED' },
    });
  });

  it('returns the money to the ledger when Paystack rejects the refund', async () => {
    const { service, tx } = setup({
      refundError: new PaymentProviderRejectedError('Transaction not found'),
    });

    await expect(service.initiateRefund('sup-1', options)).rejects.toThrow(
      BadRequestException,
    );

    expect(tx.ledgerEntry.createMany).toHaveBeenLastCalledWith({
      data: [
        expect.objectContaining({ direction: 'CREDIT', amount: 9_000 }),
        expect.objectContaining({ direction: 'CREDIT', amount: 1_000 }),
      ],
    });
  });

  it('keeps the refund pending when the outcome is unknown', async () => {
    const { service, tx } = setup({ refundError: new Error('network down') });

    const refund = await service.initiateRefund('sup-1', options);

    expect(refund.status).toBe('PENDING');
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('refuses an unpaid contribution', async () => {
    const { service, provider } = setup({
      support: { ...support, status: 'CREATED', payment: null },
    });
    await expect(service.initiateRefund('sup-1', options)).rejects.toThrow(
      'Only a paid contribution',
    );
    expect(provider.refundPayment).not.toHaveBeenCalled();
  });

  it('refuses a second refund of the same payment', async () => {
    const { service } = setup({
      existingRefund: { id: 'old', status: 'PROCESSED' },
    });
    await expect(service.initiateRefund('sup-1', options)).rejects.toThrow(
      ConflictException,
    );
  });

  it('refuses when the creator already withdrew the money unless allowed', async () => {
    const blocked = setup({ balance: 100 });
    await expect(
      blocked.service.initiateRefund('sup-1', options),
    ).rejects.toThrow('already withdrawn');

    const allowed = setup({ balance: 100 });
    await allowed.service.initiateRefund('sup-1', {
      ...options,
      allowNegativeBalance: true,
    });
    expect(allowed.provider.refundPayment).toHaveBeenCalled();
  });

  it('ignores a refund webhook that matches no open refund', async () => {
    const { service, prisma } = setup();
    (
      prisma as unknown as { refund: Record<string, unknown> }
    ).refund.findFirst = jest.fn().mockResolvedValue(null);

    expect(await service.applyProviderEvent('ref-x', 'PROCESSED')).toBe(false);
  });
});
