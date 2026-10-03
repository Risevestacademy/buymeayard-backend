import { redactBody } from './http-exception.filter';

describe('redactBody', () => {
  it('omits bodies on webhook and KYC routes entirely', () => {
    expect(
      redactBody('/webhooks/didit', { decision: { first_name: 'x' } }),
    ).toBe('[OMITTED]');
    expect(
      redactBody('/api/v1/creators/me/kyc/session', { firstName: 'x' }),
    ).toBe('[OMITTED]');
    expect(redactBody('/api/v1/admin/kyc/abc/reject', { reason: 'x' })).toBe(
      '[OMITTED]',
    );
  });

  it('masks secrets anywhere in other bodies', () => {
    expect(
      redactBody('/api/v1/auth/login', {
        email: 'a@b.com',
        password: 'hunter2',
        nested: { newPassword: 'x', Token: 'y' },
      }),
    ).toEqual({
      email: 'a@b.com',
      password: '[REDACTED]',
      nested: { newPassword: '[REDACTED]', Token: '[REDACTED]' },
    });
  });

  it('passes through non-object bodies', () => {
    expect(redactBody('/api/v1/x', undefined)).toBeUndefined();
    expect(redactBody('/api/v1/x', 'text')).toBe('text');
  });
});
