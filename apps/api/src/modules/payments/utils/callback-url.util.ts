import { BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '../../../common/errors/error-codes';

// Same local origins main.ts allows for CORS, so a frontend running on a
// developer's machine can test the checkout against a deployed API.
const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

/** Origins a Bachs checkout may send the supporter back to. */
function allowedOrigins(): Set<string> {
  const origins = new Set<string>(LOCAL_ORIGINS);
  for (const url of [
    process.env.FRONTEND_URL,
    process.env.CREATOR_FRONTEND_URL,
    process.env.ADMIN_FRONTEND_URL,
  ]) {
    try {
      if (url) origins.add(new URL(url).origin);
    } catch {
      // ignore an unset or malformed env value
    }
  }
  return origins;
}

/**
 * Validates the page Bachs sends the supporter back to, so the checkout
 * can't be used as an open redirect, and adds the support id so the page knows
 * which gift to look up. Returns undefined when none was given (Bachs then
 * uses the callback URL from its dashboard).
 */
export function resolveCallbackUrl(
  callbackUrl: string | undefined,
  supportId?: string,
): string | undefined {
  if (!callbackUrl) return undefined;

  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    url = new URL('invalid:');
  }
  if (!allowedOrigins().has(url.origin)) {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'callbackUrl must be a page on one of our own sites',
    });
  }
  if (supportId) url.searchParams.set('supportId', supportId);
  return url.toString();
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * Bachs refuses a localhost return URL. On a test deployment that sets
 * `fallbackOrigin`, a localhost URL is moved onto that site (path and query
 * kept) so a frontend running on a developer's machine can still check out.
 * Anything else is returned unchanged.
 */
export function withPublicOrigin(
  returnUrl: string | undefined,
  fallbackOrigin: string | undefined,
): string | undefined {
  if (!returnUrl || !fallbackOrigin) return returnUrl;
  try {
    const url = new URL(returnUrl);
    if (!LOCAL_HOSTS.has(url.hostname)) return returnUrl;
    const target = new URL(fallbackOrigin);
    url.protocol = target.protocol;
    url.hostname = target.hostname;
    url.port = target.port; // drops the local dev port
    return url.toString();
  } catch {
    return returnUrl;
  }
}
