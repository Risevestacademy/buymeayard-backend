import { isMobileRequest, extractSessionToken } from './client-detection.util';

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
});
