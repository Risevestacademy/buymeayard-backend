import {
  parseUserAgent,
  resolveLocationFromIp,
} from './session-parser.util';

describe('session-parser.util', () => {
  describe('parseUserAgent', () => {
    it('returns unknown values for null or empty user-agents', () => {
      expect(parseUserAgent(null)).toEqual({
        deviceType: 'UNKNOWN',
        browser: 'Unknown Browser',
        os: 'Unknown OS',
        deviceLabel: 'Unknown Device',
      });

      expect(parseUserAgent('')).toEqual({
        deviceType: 'UNKNOWN',
        browser: 'Unknown Browser',
        os: 'Unknown OS',
        deviceLabel: 'Unknown Device',
      });
    });

    it('identifies macOS Chrome on Desktop', () => {
      const ua =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
      const parsed = parseUserAgent(ua);

      expect(parsed.deviceType).toBe('DESKTOP');
      expect(parsed.browser).toBe('Chrome');
      expect(parsed.os).toBe('macOS');
      expect(parsed.deviceLabel).toBe('Chrome on macOS');
    });

    it('identifies iPhone Safari on Mobile', () => {
      const ua =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
      const parsed = parseUserAgent(ua);

      expect(parsed.deviceType).toBe('MOBILE');
      expect(parsed.browser).toBe('Safari');
      expect(parsed.os).toBe('iOS');
      expect(parsed.deviceLabel).toBe('Safari on iOS');
    });

    it('identifies iPad Safari on Tablet', () => {
      const ua =
        'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';
      const parsed = parseUserAgent(ua);

      expect(parsed.deviceType).toBe('TABLET');
      expect(parsed.os).toBe('iPadOS');
    });

    it('identifies Windows Firefox on Desktop', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
      const parsed = parseUserAgent(ua);

      expect(parsed.deviceType).toBe('DESKTOP');
      expect(parsed.browser).toBe('Firefox');
      expect(parsed.os).toBe('Windows 10/11');
      expect(parsed.deviceLabel).toBe('Firefox on Windows 10/11');
    });

    it('identifies Windows Edge on Desktop', () => {
      const ua =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0';
      const parsed = parseUserAgent(ua);

      expect(parsed.deviceType).toBe('DESKTOP');
      expect(parsed.browser).toBe('Edge');
      expect(parsed.deviceLabel).toBe('Edge on Windows 10/11');
    });

    it('identifies BuyMeAYard custom App User-Agent', () => {
      const ua = 'BuyMeAYard/1.0.0 (iPhone; iOS 18.0)';
      const parsed = parseUserAgent(ua);

      expect(parsed.deviceType).toBe('MOBILE');
      expect(parsed.browser).toBe('Buy Me a Yard App');
      expect(parsed.os).toBe('iOS');
      expect(parsed.deviceLabel).toBe('Buy Me a Yard App on iOS');
    });
  });

  describe('resolveLocationFromIp', () => {
    it('returns Local Network for loopback and private IPs', () => {
      expect(resolveLocationFromIp('127.0.0.1')).toBe('Local Network');
      expect(resolveLocationFromIp('::1')).toBe('Local Network');
      expect(resolveLocationFromIp('192.168.1.50')).toBe('Local Network');
      expect(resolveLocationFromIp('10.0.0.12')).toBe('Local Network');
    });

    it('resolves Nigerian public IP addresses', () => {
      expect(resolveLocationFromIp('102.89.23.4')).toBe('Lagos, Nigeria');
      expect(resolveLocationFromIp('197.210.55.12')).toBe('Lagos, Nigeria');
    });

    it('returns Online or Unknown Location for other IPs or empty input', () => {
      expect(resolveLocationFromIp(null)).toBe('Unknown Location');
      expect(resolveLocationFromIp('')).toBe('Unknown Location');
      expect(resolveLocationFromIp('8.8.8.8')).toBe('Online');
    });
  });
});
