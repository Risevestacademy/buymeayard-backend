import {
  isMobileRequest,
  extractSessionToken,
  extractSessionTokenFromCookie,
  isMobileRedirectUrl,
  appendTokenToUrl,
} from './client-detection.util';

describe('client-detection.util', () => {
  describe('isMobileRequest', () => {
    it('should return true when x-client-type is mobile or app or react-native', () => {
      expect(isMobileRequest({ 'x-client-type': 'mobile' })).toBe(true);
      expect(isMobileRequest({ 'x-client-type': 'app' })).toBe(true);
      expect(isMobileRequest({ 'x-client-type': 'react-native' })).toBe(true);
    });

    it('should return true when x-platform is mobile, ios, or android', () => {
      expect(isMobileRequest({ 'x-platform': 'mobile' })).toBe(true);
      expect(isMobileRequest({ 'x-platform': 'ios' })).toBe(true);
      expect(isMobileRequest({ 'x-platform': 'android' })).toBe(true);
    });

    it('should return true when x-mobile-app is true', () => {
      expect(isMobileRequest({ 'x-mobile-app': 'true' })).toBe(true);
      expect(isMobileRequest({ 'x-mobile': 'true' })).toBe(true);
    });

    it('should return true when using Web Headers with mobile header', () => {
      const headers = new Headers();
      headers.set('x-client-type', 'mobile');
      expect(isMobileRequest(headers)).toBe(true);
    });

    it('should return false for web or standard browser requests', () => {
      expect(isMobileRequest({})).toBe(false);
      expect(isMobileRequest({ 'user-agent': 'Mozilla/5.0' })).toBe(false);
      expect(isMobileRequest({ 'x-client-type': 'web' })).toBe(false);
    });
  });

  describe('extractSessionToken', () => {
    it('should extract token from body if present', () => {
      const res = new Response();
      const body = { token: 'token-from-body' };
      expect(extractSessionToken(res, body)).toBe('token-from-body');
    });

    it('should extract token from body.session.token if present', () => {
      const res = new Response();
      const body = { session: { token: 'token-from-session' } };
      expect(extractSessionToken(res, body)).toBe('token-from-session');
    });

    it('should extract token from set-auth-token response header', () => {
      const headers = new Headers();
      headers.set('set-auth-token', 'token-from-header');
      const res = new Response(null, { headers });
      expect(extractSessionToken(res, {})).toBe('token-from-header');
    });

    it('should extract token from set-cookie header', () => {
      const headers = new Headers();
      headers.set(
        'set-cookie',
        'better-auth.session_token=cookie-token-123; Path=/; HttpOnly',
      );
      const res = new Response(null, { headers });
      expect(extractSessionToken(res, {})).toBe('cookie-token-123');
    });
  });

  describe('extractSessionTokenFromCookie', () => {
    it('should extract token from single string cookie', () => {
      const cookie = 'better-auth.session_token=abc-123; Path=/; HttpOnly';
      expect(extractSessionTokenFromCookie(cookie)).toBe('abc-123');
    });

    it('should extract token from __Secure- prefixed cookie', () => {
      const cookie =
        '__Secure-better-auth.session_token=sec-token-456; Path=/; Secure';
      expect(extractSessionTokenFromCookie(cookie)).toBe('sec-token-456');
    });

    it('should extract token from array of cookies', () => {
      const cookies = [
        'other_cookie=xyz; Path=/',
        '__Secure-better-auth.session_token=nested-tok; Path=/; Secure',
      ];
      expect(extractSessionTokenFromCookie(cookies)).toBe('nested-tok');
    });

    it('should return undefined if no session token cookie is found', () => {
      expect(extractSessionTokenFromCookie(undefined)).toBeUndefined();
      expect(extractSessionTokenFromCookie('some_cookie=abc')).toBeUndefined();
    });
  });

  describe('isMobileRedirectUrl', () => {
    it('should return true for custom schemes', () => {
      expect(isMobileRedirectUrl('bmay-dev://oauth-callback')).toBe(true);
      expect(isMobileRedirectUrl('bmay://oauth-callback')).toBe(true);
      expect(isMobileRedirectUrl('bmay-preview://oauth-callback')).toBe(true);
      expect(isMobileRedirectUrl('buymeayard://oauth-callback')).toBe(true);
      expect(isMobileRedirectUrl('exp://127.0.0.1:8081')).toBe(true);
    });

    it('should return false for regular web URLs without mobile markers', () => {
      expect(isMobileRedirectUrl('http://localhost:3000')).toBe(false);
      expect(isMobileRedirectUrl('https://buymeayard.com/dashboard')).toBe(
        false,
      );
      expect(isMobileRedirectUrl('/dashboard')).toBe(false);
    });

    it('should return true for URLs containing mobile markers in query parameters', () => {
      expect(
        isMobileRedirectUrl('https://buymeayard.com/callback?from=mobile'),
      ).toBe(true);
      expect(
        isMobileRedirectUrl('https://buymeayard.com/callback?client=mobile'),
      ).toBe(true);
      expect(
        isMobileRedirectUrl('https://buymeayard.com/callback?mobile=true'),
      ).toBe(true);
    });

    it('should return true if request headers specify a mobile client', () => {
      expect(
        isMobileRedirectUrl('http://localhost:3000', {
          'x-client-type': 'mobile',
        }),
      ).toBe(true);
    });
  });

  describe('appendTokenToUrl', () => {
    it('should append token to a custom deep link with no existing parameters', () => {
      expect(
        appendTokenToUrl('bmay-dev://oauth-callback', 'session-token-xyz'),
      ).toBe('bmay-dev://oauth-callback?token=session-token-xyz');
    });

    it('should append token to a URL with existing query parameters', () => {
      expect(
        appendTokenToUrl(
          'bmay-dev://oauth-callback?step=done',
          'session-token-xyz',
        ),
      ).toBe('bmay-dev://oauth-callback?step=done&token=session-token-xyz');
    });

    it('should overwrite existing token parameter cleanly', () => {
      expect(
        appendTokenToUrl(
          'bmay-dev://oauth-callback?token=old-token',
          'new-token',
        ),
      ).toBe('bmay-dev://oauth-callback?token=new-token');
    });

    it('should handle standard http/https URLs', () => {
      expect(
        appendTokenToUrl(
          'https://buymeayard.com/oauth-callback',
          'session-token-xyz',
        ),
      ).toBe('https://buymeayard.com/oauth-callback?token=session-token-xyz');
    });
  });
});
