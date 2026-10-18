import * as crypto from 'crypto';
import type { IncomingHttpHeaders } from 'http';

export const DIDIT_SIGNATURE_TOLERANCE_SECONDS = 300;

export type DiditSignatureResult =
  | { isValid: true; payload: Record<string, unknown> }
  | { isValid: false; reason: string };

function header(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** Recursively sorts object keys; array order is preserved. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Didit's X-Signature-V2 canonical form: sorted keys, compact separators,
 * unescaped Unicode, whole-valued floats as integers. JSON.stringify already
 * uses compact separators, leaves Unicode unescaped and prints 5.0 as 5.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function hmacHex(secret: string, data: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqualHex(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided.trim().toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function isFresh(timestamp: unknown, nowSeconds: number): boolean {
  const ts = typeof timestamp === 'string' ? Number(timestamp) : timestamp;
  return (
    typeof ts === 'number' &&
    Number.isFinite(ts) &&
    Math.abs(nowSeconds - ts) <= DIDIT_SIGNATURE_TOLERANCE_SECONDS
  );
}

/**
 * Verifies a Didit webhook. Accepts X-Signature-V2 (canonical JSON) or
 * X-Signature (exact raw bytes). The deprecated X-Signature-Simple is
 * deliberately NOT accepted: it does not cover the decision payload.
 */
export function verifyDiditSignature(
  secret: string,
  headers: IncomingHttpHeaders,
  rawBody: Buffer | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): DiditSignatureResult {
  if (!secret)
    return { isValid: false, reason: 'webhook secret not configured' };
  if (!rawBody || rawBody.length === 0) {
    return { isValid: false, reason: 'missing raw body' };
  }

  if (!isFresh(header(headers, 'x-timestamp'), nowSeconds)) {
    return { isValid: false, reason: 'stale or missing X-Timestamp' };
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { isValid: false, reason: 'body is not a JSON object' };
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return { isValid: false, reason: 'body is not valid JSON' };
  }

  const signatureV2 = header(headers, 'x-signature-v2');
  const signatureRaw = header(headers, 'x-signature');

  const valid =
    safeEqualHex(hmacHex(secret, canonicalJson(payload)), signatureV2) ||
    safeEqualHex(hmacHex(secret, rawBody), signatureRaw);

  if (!valid) return { isValid: false, reason: 'signature mismatch' };

  // The header timestamp is not covered by the signature; the body's is.
  // Reject replays of an old signed body sent with a fresh header.
  if ('timestamp' in payload && !isFresh(payload.timestamp, nowSeconds)) {
    return { isValid: false, reason: 'stale signed timestamp' };
  }

  return { isValid: true, payload };
}
