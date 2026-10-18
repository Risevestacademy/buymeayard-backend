import type { IncomingHttpHeaders } from 'http';

/**
 * Standard custom headers to detect mobile client requests.
 * Supported options:
 * - `x-client-type: mobile` | `app` | `react-native` | `flutter` | `ios` | `android`
 * - `x-platform: mobile` | `ios` | `android` | `react-native` | `flutter`
 * - `x-mobile-app: true` | `1`
 * - `x-client: mobile` | `app`
 */
export function isMobileRequest(
  headers:
    | Headers
    | IncomingHttpHeaders
    | Record<string, string | string[] | undefined>,
): boolean {
  if (!headers) return false;

  const getHeader = (name: string): string | undefined => {
    if ('get' in headers && typeof (headers as any).get === 'function') {
      return (headers as Headers).get(name) || undefined;
    }
    const val = (headers as IncomingHttpHeaders)[name.toLowerCase()];
    return Array.isArray(val) ? val[0] : val;
  };

  const clientType = getHeader('x-client-type')?.toLowerCase();
  if (
    clientType === 'mobile' ||
    clientType === 'app' ||
    clientType === 'react-native' ||
    clientType === 'flutter' ||
    clientType === 'ios' ||
    clientType === 'android'
  ) {
    return true;
  }

  const platform = getHeader('x-platform')?.toLowerCase();
  if (
    platform === 'mobile' ||
    platform === 'ios' ||
    platform === 'android' ||
    platform === 'react-native' ||
    platform === 'flutter'
  ) {
    return true;
  }

  const mobileApp =
    getHeader('x-mobile-app')?.toLowerCase() ||
    getHeader('x-mobile')?.toLowerCase();
  if (mobileApp === 'true' || mobileApp === '1') {
    return true;
  }

  const client = getHeader('x-client')?.toLowerCase();
  if (client === 'mobile' || client === 'app') {
    return true;
  }

  return false;
}

/**
 * Extracts session token from cookie string or array of cookie strings.
 */
export function extractSessionTokenFromCookie(
  setCookie: string | string[] | number | undefined,
): string | undefined {
  if (!setCookie) return undefined;
  const cookies = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
  for (const cookie of cookies) {
    const match = cookie.match(
      /(?:__Secure-)?better-auth\.session_token=([^;]+)/,
    );
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return undefined;
}

/**
 * Extracts session token from Better Auth Web Response or parsed response body.
 */
export function extractSessionToken(
  webRes: globalThis.Response,
  body: any,
): string | undefined {
  // 1. Check body.token or body.session?.token
  if (body && typeof body === 'object') {
    if (body.token && typeof body.token === 'string') {
      return body.token;
    }
    if (
      body.session &&
      body.session.token &&
      typeof body.session.token === 'string'
    ) {
      return body.session.token;
    }
  }

  // 2. Check set-auth-token response header (set by Better Auth bearer plugin)
  const setAuthToken = webRes.headers.get('set-auth-token');
  if (setAuthToken) {
    return setAuthToken;
  }

  // 3. Extract token from set-cookie header
  let setCookies: string[] = [];
  if (typeof (webRes.headers as any).getSetCookie === 'function') {
    setCookies = (webRes.headers as any).getSetCookie() || [];
  } else {
    const raw = webRes.headers.get('set-cookie');
    if (raw) setCookies = [raw];
  }

  return extractSessionTokenFromCookie(setCookies);
}

/**
 * Determines whether a redirect URL is intended for a mobile application client.
 * Identifies custom schemes (e.g. `bmay-dev://`, `buymeayard://`, `exp://`)
 * or mobile query parameters / request headers.
 */
export function isMobileRedirectUrl(
  url: string,
  reqHeaders?:
    | Headers
    | IncomingHttpHeaders
    | Record<string, string | string[] | undefined>,
): boolean {
  if (!url || typeof url !== 'string') return false;

  // Custom deep link scheme (e.g. bmay://, bmay-dev://, buymeayard://, exp://)
  if (
    url.includes('://') &&
    !url.startsWith('http://') &&
    !url.startsWith('https://')
  ) {
    return true;
  }

  // Check URL query parameters for mobile markers
  try {
    const parsed = new URL(url, 'http://localhost');
    const from = parsed.searchParams.get('from')?.toLowerCase();
    const client = parsed.searchParams.get('client')?.toLowerCase();
    const platform = parsed.searchParams.get('platform')?.toLowerCase();
    if (
      from === 'mobile' ||
      client === 'mobile' ||
      client === 'app' ||
      platform === 'mobile' ||
      parsed.searchParams.get('mobile') === 'true'
    ) {
      return true;
    }
  } catch {
    // ignore URL parse errors
  }

  // Check if request headers identify client as mobile
  if (reqHeaders && isMobileRequest(reqHeaders)) {
    return true;
  }

  return false;
}

/**
 * Appends the session token to a callback URL (preserving any existing search parameters).
 */
export function appendTokenToUrl(rawUrl: string, token: string): string {
  if (!rawUrl || !token) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('token', token);
    return parsed.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}token=${encodeURIComponent(token)}`;
  }
}

/**
 * Appends an error code to a callback URL (preserving any existing search parameters).
 */
export function appendErrorToUrl(rawUrl: string, error: string): string {
  if (!rawUrl || !error) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('error', error);
    return parsed.toString();
  } catch {
    const sep = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${sep}error=${encodeURIComponent(error)}`;
  }
}
