import * as crypto from 'crypto';
import {
  canonicalJson,
  sortKeysDeep,
  verifyDiditSignature,
} from './didit-signature';

const SECRET = 'test-webhook-secret';
const NOW = 1_774_970_000;

const hmac = (data: string | Buffer) =>
  crypto.createHmac('sha256', SECRET).update(data).digest('hex');

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    webhook_type: 'status.updated',
    session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    status: 'Approved',
    timestamp: NOW,
    event_id: 'evt-1',
    vendor_data: 'creator-1',
    decision: {
      id_verifications: [
        { status: 'Approved', first_name: 'Adéọlá', score: 5.0 },
      ],
    },
    ...overrides,
  };
}

describe('Didit webhook signature', () => {
  describe('canonicalJson', () => {
    it('sorts keys recursively, keeps array order, compact, unescaped unicode', () => {
      const input = { b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'Adéọlá' } };
      // Hand-written expected canonical form (Python sort_keys + ensure_ascii=False)
      expect(canonicalJson(input)).toBe(
        '{"a":{"c":"Adéọlá","d":[3,{"y":2,"z":1}]},"b":1}',
      );
    });

    it('prints whole-valued floats as integers', () => {
      expect(canonicalJson({ score: 5.0, other: 0.5 })).toBe(
        '{"other":0.5,"score":5}',
      );
    });

    it('does not mutate its input', () => {
      const input = { b: 1, a: 2 };
      sortKeysDeep(input);
      expect(Object.keys(input)).toEqual(['b', 'a']);
    });
  });

  describe('verifyDiditSignature', () => {
    it('accepts a valid X-Signature-V2 even when the raw body key order differs', () => {
      const payload = makePayload();
      // Raw body in non-canonical order and with spacing
      const raw = Buffer.from(JSON.stringify(payload, null, 2));
      const headers = {
        'x-timestamp': String(NOW),
        'x-signature-v2': hmac(canonicalJson(payload)),
      };
      const result = verifyDiditSignature(SECRET, headers, raw, NOW);
      expect(result.isValid).toBe(true);
    });

    it('accepts a valid X-Signature over the exact raw bytes', () => {
      const raw = Buffer.from(JSON.stringify(makePayload()));
      const headers = { 'x-timestamp': String(NOW), 'x-signature': hmac(raw) };
      expect(verifyDiditSignature(SECRET, headers, raw, NOW).isValid).toBe(
        true,
      );
    });

    it('accepts an uppercase hex signature', () => {
      const raw = Buffer.from(JSON.stringify(makePayload()));
      const headers = {
        'x-timestamp': String(NOW),
        'x-signature': hmac(raw).toUpperCase(),
      };
      expect(verifyDiditSignature(SECRET, headers, raw, NOW).isValid).toBe(
        true,
      );
    });

    it('rejects a tampered decision', () => {
      const payload = makePayload();
      const signature = hmac(canonicalJson(payload));
      const tampered = makePayload({
        status: 'Approved',
        decision: { hacked: true },
      });
      const raw = Buffer.from(JSON.stringify(tampered));
      const headers = {
        'x-timestamp': String(NOW),
        'x-signature-v2': signature,
      };
      const result = verifyDiditSignature(SECRET, headers, raw, NOW);
      expect(result).toEqual({ isValid: false, reason: 'signature mismatch' });
    });

    it('rejects a signature made with a different secret', () => {
      const payload = makePayload();
      const raw = Buffer.from(JSON.stringify(payload));
      const wrong = crypto
        .createHmac('sha256', 'other-secret')
        .update(canonicalJson(payload))
        .digest('hex');
      const headers = { 'x-timestamp': String(NOW), 'x-signature-v2': wrong };
      expect(verifyDiditSignature(SECRET, headers, raw, NOW).isValid).toBe(
        false,
      );
    });

    it('rejects a stale X-Timestamp header', () => {
      const payload = makePayload();
      const raw = Buffer.from(JSON.stringify(payload));
      const headers = {
        'x-timestamp': String(NOW - 301),
        'x-signature-v2': hmac(canonicalJson(payload)),
      };
      const result = verifyDiditSignature(SECRET, headers, raw, NOW);
      expect(result).toEqual({
        isValid: false,
        reason: 'stale or missing X-Timestamp',
      });
    });

    it('rejects a replayed old signed body sent with a fresh header', () => {
      const payload = makePayload({ timestamp: NOW - 3600 });
      const raw = Buffer.from(JSON.stringify(payload));
      const headers = {
        'x-timestamp': String(NOW),
        'x-signature-v2': hmac(canonicalJson(payload)),
      };
      const result = verifyDiditSignature(SECRET, headers, raw, NOW);
      expect(result).toEqual({
        isValid: false,
        reason: 'stale signed timestamp',
      });
    });

    it('rejects when only the deprecated X-Signature-Simple is present', () => {
      const payload = makePayload();
      const raw = Buffer.from(JSON.stringify(payload));
      const simple = hmac(
        `${NOW}:${payload.session_id}:${payload.status}:${payload.webhook_type}`,
      );
      const headers = {
        'x-timestamp': String(NOW),
        'x-signature-simple': simple,
      };
      expect(verifyDiditSignature(SECRET, headers, raw, NOW).isValid).toBe(
        false,
      );
    });

    it('rejects when no secret is configured', () => {
      const raw = Buffer.from(JSON.stringify(makePayload()));
      const headers = { 'x-timestamp': String(NOW), 'x-signature': hmac(raw) };
      expect(verifyDiditSignature('', headers, raw, NOW).isValid).toBe(false);
    });

    it('rejects a missing body and non-object JSON', () => {
      const headers = { 'x-timestamp': String(NOW) };
      expect(
        verifyDiditSignature(SECRET, headers, undefined, NOW).isValid,
      ).toBe(false);
      const arr = Buffer.from('[1,2]');
      expect(
        verifyDiditSignature(
          SECRET,
          { ...headers, 'x-signature': hmac(arr) },
          arr,
          NOW,
        ).isValid,
      ).toBe(false);
      const junk = Buffer.from('not json');
      expect(verifyDiditSignature(SECRET, headers, junk, NOW).isValid).toBe(
        false,
      );
    });
  });
});
