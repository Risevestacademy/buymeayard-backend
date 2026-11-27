import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate limits per client IP. Behind a reverse proxy `req.ip` is the proxy, so
 * every visitor would share one limit; use the address the proxy appended to
 * X-Forwarded-For (the last entry, which a client cannot forge).
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const forwarded = req.headers?.['x-forwarded-for'];
    const last =
      typeof forwarded === 'string'
        ? forwarded.split(',').pop()?.trim()
        : undefined;
    return Promise.resolve(last || req.ip || 'anonymous');
  }
}
