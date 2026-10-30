import { BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '../../../common/errors/error-codes';

/** Origins a Paystack checkout may send the supporter back to. */
function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
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
 * Validates the page Paystack sends the supporter back to, so the checkout
 * can't be used as an open redirect, and adds the support id so the page knows
 * which gift to look up. Returns undefined when none was given (Paystack then
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
