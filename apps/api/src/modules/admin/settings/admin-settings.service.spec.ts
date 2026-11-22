import { AdminSettingsService } from './admin-settings.service';

describe('AdminSettingsService', () => {
  const current = {
    platformFeePercent: 10,
    minimumWithdrawal: 100_000,
    payoutFeeTierLimit: 5_000_000,
    payoutFeeUpToLimit: 5_000,
    payoutFeeAboveLimit: 10_000,
    currencyRates: {},
  };

  function setup() {
    const settings = {
      get: jest.fn().mockResolvedValue(current),
      defaults: jest.fn().mockReturnValue(current),
      save: jest.fn((patch: object) =>
        Promise.resolve({ ...current, ...patch }),
      ),
    };
    const audit = { record: jest.fn() };
    return {
      settings,
      audit,
      service: new AdminSettingsService(settings as never, audit as never),
    };
  }

  it('saves only the fields sent and audits the before and after', async () => {
    const { service, settings, audit } = setup();

    const res = await service.update('admin-1', { platformFeePercent: 8 });

    expect(settings.save).toHaveBeenCalledWith(
      { platformFeePercent: 8 },
      'admin-1',
    );
    expect(res.settings.platformFeePercent).toBe(8);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.settings.updated',
        previousState: current,
        newState: { ...current, platformFeePercent: 8 },
      }),
    );
  });

  it('saves currency rates as sent, not as kobo', async () => {
    const { service, settings } = setup();
    await service.update('admin-1', { currencyRates: { USD: 1500 } });
    expect(settings.save).toHaveBeenCalledWith(
      { currencyRates: { USD: 1500 } },
      'admin-1',
    );
  });

  it.each<Record<string, number>>([
    { EUR: 1700 },
    { NGN: 1 },
    { USD: 0 },
    { USD: -5 },
  ])('rejects currency rates %p', async (currencyRates) => {
    const { service, settings } = setup();
    await expect(
      service.update('admin-1', { currencyRates }),
    ).rejects.toMatchObject({ status: 400 });
    expect(settings.save).not.toHaveBeenCalled();
  });

  it('rejects a minimum withdrawal that the payout fee would swallow', async () => {
    const { service, settings } = setup();

    await expect(
      service.update('admin-1', { minimumWithdrawal: 100 }),
    ).rejects.toThrow('must be higher than the payout fee');
    expect(settings.save).not.toHaveBeenCalled();
  });
});
