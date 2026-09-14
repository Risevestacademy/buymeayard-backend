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

  for (const cookie of setCookies) {
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
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
