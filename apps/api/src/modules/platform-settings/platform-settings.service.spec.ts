import {
  DEFAULT_PAYOUT_RULES,
  PlatformSettingsService,
} from './platform-settings.service';

describe('PlatformSettingsService', () => {
  function setup(row: { value: unknown } | null, envFee?: number) {
    const prisma = {
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue(row),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const config = { get: jest.fn().mockReturnValue(envFee) };
    return {
      prisma,
      service: new PlatformSettingsService(prisma as never, config as never),
    };
  }

  it('falls back to the env fee and built-in withdrawal rules when nothing is saved', async () => {
    const { service } = setup(null, 12);
    expect(await service.get()).toEqual({
      platformFeePercent: 12,
      ...DEFAULT_PAYOUT_RULES,
    });
  });

  it('lets a saved value, including a 0% fee, override the default', async () => {
    const { service } = setup({
      value: { platformFeePercent: 0, minimumWithdrawal: 200_000 },
    });
    expect(await service.get()).toMatchObject({
      platformFeePercent: 0,
      minimumWithdrawal: 200_000,
      payoutFeeUpToLimit: DEFAULT_PAYOUT_RULES.payoutFeeUpToLimit,
    });
  });

  it('serves a saved change straight away without another read', async () => {
    const { service, prisma } = setup(null, 10);
    await service.get();

    const saved = await service.save({ platformFeePercent: 7 }, 'admin-1');

    expect(saved.platformFeePercent).toBe(7);
    expect((await service.get()).platformFeePercent).toBe(7);
    expect(prisma.platformSetting.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ updatedBy: 'admin-1' }),
      }),
    );
  });

  it('uses the defaults, without caching them, when the table cannot be read', async () => {
    const { service, prisma } = setup(null, 10);
    prisma.platformSetting.findUnique.mockRejectedValueOnce(
      new Error('relation does not exist'),
    );

    expect((await service.get()).platformFeePercent).toBe(10);

    prisma.platformSetting.findUnique.mockResolvedValueOnce({
      value: { platformFeePercent: 5 },
    });
    expect((await service.get()).platformFeePercent).toBe(5);
  });
});
