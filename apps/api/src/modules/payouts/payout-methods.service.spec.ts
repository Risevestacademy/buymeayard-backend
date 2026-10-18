import { PaymentProviderRejectedError } from '../../infrastructure/payments/payment-provider.interface';
import { PayoutMethodsService } from './payout-methods.service';

describe('PayoutMethodsService', () => {
  const input = { bankCode: '058', accountNumber: '0123454589' };

  function setup(
    opts: { kycStatus?: string; resolve?: () => Promise<unknown> } = {},
  ) {
    const tx = {
      payoutMethod: {
        updateMany: jest.fn(),
        create: jest
          .fn()
          .mockImplementation((args) =>
            Promise.resolve({ id: 'pm-2', ...args.data }),
          ),
      },
    };
    const prisma = {
      creatorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'creator-1',
          kycStatus: opts.kycStatus ?? 'VERIFIED',
        }),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const provider = {
      listBanks: jest.fn().mockResolvedValue([
        { name: 'Zenith Bank', code: '057', slug: 'zenith-bank' },
        {
          name: 'Guaranty Trust Bank',
          code: '058',
          slug: 'guaranty-trust-bank',
        },
      ]),
      resolveAccount: jest.fn(
        opts.resolve ??
          (() =>
            Promise.resolve({
              accountName: 'SHOSANYA ISAAC OLUWADAMILARE',
              accountNumber: '0123454589',
            })),
      ),
      createTransferRecipient: jest.fn().mockResolvedValue('RCP_123'),
    };
    return {
      tx,
      provider,
      service: new PayoutMethodsService(prisma as never, provider as never),
    };
  }

  it('lists banks alphabetically and caches them', async () => {
    const { service, provider } = setup();
    const banks = await service.listBanks();
    await service.listBanks();
    expect(banks.map((b) => b.code)).toEqual(['058', '057']);
    expect(provider.listBanks).toHaveBeenCalledTimes(1);
  });

  it('returns the name the bank has on file', async () => {
    const { service } = setup();
    await expect(service.resolveAccount('user-1', input)).resolves.toEqual({
      accountName: 'SHOSANYA ISAAC OLUWADAMILARE',
      accountNumber: '0123454589',
      bankCode: '058',
      bankName: 'Guaranty Trust Bank',
    });
  });

  it('reports an account the bank cannot verify', async () => {
    const { service } = setup({
      resolve: () => Promise.reject(new PaymentProviderRejectedError('nope')),
    });
    await expect(service.resolveAccount('user-1', input)).rejects.toMatchObject(
      {
        response: { code: 'BANK_ACCOUNT_UNVERIFIED' },
      },
    );
  });

  it('reports a bank outage separately from a bad account', async () => {
    const { service } = setup({
      resolve: () => Promise.reject(new Error('timeout')),
    });
    await expect(service.resolveAccount('user-1', input)).rejects.toMatchObject(
      {
        response: { code: 'BANK_SERVICE_UNAVAILABLE' },
      },
    );
  });

  it('rejects banks Paystack does not support', async () => {
    const { service } = setup();
    await expect(
      service.resolveAccount('user-1', { ...input, bankCode: '999' }),
    ).rejects.toMatchObject({ response: { code: 'BANK_NOT_SUPPORTED' } });
  });

  it('requires verified identity before adding an account', async () => {
    const { service, provider } = setup({ kycStatus: 'PENDING' });
    await expect(service.resolveAccount('user-1', input)).rejects.toMatchObject(
      {
        response: { code: 'KYC_REQUIRED' },
      },
    );
    expect(provider.resolveAccount).not.toHaveBeenCalled();
  });

  it('reuses the lookup the creator just confirmed when saving', async () => {
    const { service, provider } = setup();
    await service.resolveAccount('user-1', input);
    await service.savePayoutMethod('user-1', input);
    expect(provider.resolveAccount).toHaveBeenCalledTimes(1);
  });

  it('saves the verified account and retires the previous one', async () => {
    const { service, tx, provider } = setup();

    const saved = await service.savePayoutMethod('user-1', input);

    expect(provider.createTransferRecipient).toHaveBeenCalledWith({
      accountName: 'SHOSANYA ISAAC OLUWADAMILARE',
      accountNumber: '0123454589',
      bankCode: '058',
    });
    expect(tx.payoutMethod.updateMany).toHaveBeenCalledWith({
      where: { creatorId: 'creator-1', status: 'ACTIVE' },
      data: { status: 'INACTIVE', isDefault: false },
    });
    expect(tx.payoutMethod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientCode: 'RCP_123',
        accountName: 'SHOSANYA ISAAC OLUWADAMILARE',
        isDefault: true,
        status: 'ACTIVE',
      }),
    });
    expect(saved).toEqual({
      id: 'pm-2',
      bankName: 'Guaranty Trust Bank',
      bankCode: '058',
      accountName: 'SHOSANYA ISAAC OLUWADAMILARE',
      accountNumberLast4: '4589',
      verified: true,
    });
  });
});
