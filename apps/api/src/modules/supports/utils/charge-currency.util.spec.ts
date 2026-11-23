import {
  resolveChargeCurrency,
  toChargeMinor,
  toLedgerMinor,
} from './charge-currency.util';

describe('charge currency', () => {
  const rates = { USD: 1500, GHS: 100 };

  it('uses the requested currency when it has a rate', () => {
    expect(resolveChargeCurrency('usd', rates)).toEqual({
      currency: 'USD',
      rate: 1500,
    });
  });

  it.each([undefined, '', 'NGN', 'KES', 'EUR', 'XOF'])(
    'falls back to NGN for %p',
    (code) => {
      expect(resolveChargeCurrency(code, rates)).toEqual({
        currency: 'NGN',
        rate: 1,
      });
    },
  );

  it('ignores a rate that is not positive', () => {
    expect(resolveChargeCurrency('USD', { USD: 0 }).currency).toBe('NGN');
  });

  it('converts to ledger kobo and charge minor units', () => {
    expect(toLedgerMinor(10, 1500)).toBe(1_500_000);
    expect(toLedgerMinor(0.33, 1500.5)).toBe(49_517);
    expect(toChargeMinor(10.5)).toBe(1050);
  });
});
