import { CurrencyRates } from './charge-currency.util';

/** Countries whose own currency we can charge in. Anywhere else gets USD. */
const COUNTRY_CURRENCY: Record<string, string> = {
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  US: 'USD',
};

const INTERNATIONAL_CURRENCY = 'USD';

/**
 * The currency to open the support page in for a visitor from `country`:
 * their own currency if we offer it, otherwise USD if we offer that, and NGN
 * when neither is on offer or the country is unknown.
 */
export function defaultCurrencyForCountry(
  country: string | null | undefined,
  rates: CurrencyRates,
): string {
  const offered = (code: string) => code === 'NGN' || (rates[code] ?? 0) > 0;
  const code = country?.trim().toUpperCase();
  if (!code) return 'NGN';
  const own = COUNTRY_CURRENCY[code];
  if (own && offered(own)) return own;
  return offered(INTERNATIONAL_CURRENCY) ? INTERNATIONAL_CURRENCY : 'NGN';
}
