/** Headers a CDN or host sets with the visitor's two-letter country code. */
const COUNTRY_HEADERS = [
  'cf-ipcountry', // Cloudflare
  'x-vercel-ip-country', // Vercel
  'cloudfront-viewer-country', // CloudFront
  'x-country-code',
];

type Headers = Record<string, string | string[] | undefined>;

/** Looks an IP up in a country database; returns null when it is not found. */
export type IpCountryLookup = (ip: string) => string | null;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The visitor's address: the first X-Forwarded-For entry, else the socket's. */
export function clientIp(headers: Headers, socketIp?: string): string | null {
  const forwarded = first(headers['x-forwarded-for']);
  const ip = forwarded?.split(',')[0]?.trim() || socketIp || '';
  return ip || null;
}

/**
 * Two-letter country of a request: a CDN country header when there is one,
 * otherwise a lookup on the visitor's IP. Null when unknown. Only picks a
 * default currency, so a forged header is harmless.
 */
export function detectCountry(
  headers: Headers,
  socketIp: string | undefined,
  lookup?: IpCountryLookup,
): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = first(headers[name])?.trim().toUpperCase();
    // Cloudflare sends XX for unknown and T1 for Tor
    if (value && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1') {
      return value;
    }
  }
  const ip = clientIp(headers, socketIp);
  if (!ip || !lookup) return null;
  try {
    return lookup(ip)?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}
