import { BadRequestException } from '@nestjs/common';
import { resolveCallbackUrl } from './callback-url.util';

describe('resolveCallbackUrl', () => {
  const env = process.env;
  beforeEach(() => {
    process.env = {
      ...env,
      FRONTEND_URL: 'https://buymeayard.com',
      CREATOR_FRONTEND_URL: 'https://creator.buymeayard.com',
      ADMIN_FRONTEND_URL: '',
    };
  });
  afterEach(() => {
    process.env = env;
  });

  it('returns undefined when none was given', () => {
    expect(resolveCallbackUrl(undefined, 's-1')).toBeUndefined();
  });

  it('accepts our own sites and adds the support id', () => {
    expect(
      resolveCallbackUrl('https://buymeayard.com/adeola/thanks?x=1', 's-1'),
    ).toBe('https://buymeayard.com/adeola/thanks?x=1&supportId=s-1');
  });

  it('accepts the local frontends used in development', () => {
    expect(
      resolveCallbackUrl('http://localhost:3000/adeola/thanks', 's-1'),
    ).toBe('http://localhost:3000/adeola/thanks?supportId=s-1');
  });

  it.each([
    'http://localhost:4000/thanks',
    'https://evil.example.com/thanks',
    'https://buymeayard.com.evil.com/',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => resolveCallbackUrl(url)).toThrow(BadRequestException);
  });
});
