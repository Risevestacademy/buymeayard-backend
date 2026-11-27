import { defaultCurrencyForCountry } from './country-currency.util';

describe('defaultCurrencyForCountry', () => {
  const rates = { USD: 1500, GHS: 100 };

  it.each([
    ['NG', 'NGN'],
    ['ng', 'NGN'],
    ['US', 'USD'],
    ['GH', 'GHS'],
  ])('%s opens in %s', (country, currency) => {
    expect(defaultCurrencyForCountry(country, rates)).toBe(currency);
  });

  it('gives USD to a country without its own currency on offer', () => {
    expect(defaultCurrencyForCountry('GB', rates)).toBe('USD');
    expect(defaultCurrencyForCountry('KE', rates)).toBe('USD'); // no KES rate
  });

  it('falls back to NGN when the country is unknown or nothing else is offered', () => {
    expect(defaultCurrencyForCountry(null, rates)).toBe('NGN');
    expect(defaultCurrencyForCountry('US', {})).toBe('NGN');
  });
});
