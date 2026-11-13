import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://x@localhost/x',
    BETTER_AUTH_SECRET: 'a-secret-that-is-long-enough',
  };
  const didit = {
    BACHS_API_KEY: 'sk_live_key',
    BACHS_WEBHOOK_SECRET: 'whsec',
    DIDIT_API_KEY: 'key',
    DIDIT_WORKFLOW_ID: 'wf',
    DIDIT_WEBHOOK_SECRET: 'secret',
    CREATOR_FRONTEND_URL: 'https://creator.buymeayard.com',
  };

  it('does not require Didit or Bachs settings outside production', () => {
    const env = validateEnv({ ...base, NODE_ENV: 'development' });
    expect(env.CREATOR_FRONTEND_URL).toBe('http://localhost:3001');
    expect(env.KYC_MAX_SESSIONS_PER_DAY).toBe(5);
  });

  it('boots in production when everything is set', () => {
    expect(() =>
      validateEnv({ ...base, ...didit, NODE_ENV: 'production' }),
    ).not.toThrow();
  });

  it.each(Object.keys(didit))(
    'refuses to boot in production without %s',
    (key) => {
      const env: Record<string, unknown> = {
        ...base,
        ...didit,
        NODE_ENV: 'production',
      };
      delete env[key];
      expect(() => validateEnv(env)).toThrow(key);
    },
  );

  it('defaults required KYC checks to all three', () => {
    expect(validateEnv(base).KYC_REQUIRED_CHECKS).toBe(
      'ID_VERIFICATION,LIVENESS,FACE_MATCH',
    );
  });

  it.each([[''], ['ID_VERIFICATION,NFC'], [' , ']])(
    'rejects invalid KYC_REQUIRED_CHECKS %p',
    (value) => {
      expect(() =>
        validateEnv({ ...base, KYC_REQUIRED_CHECKS: value }),
      ).toThrow('KYC_REQUIRED_CHECKS');
    },
  );
  describe('Bachs', () => {
    it('does not need Bachs keys outside production', () => {
      const env = validateEnv({ ...base, NODE_ENV: 'development' });
      expect(env.BACHS_API_KEY).toBe('sk_sandbox_mock');
    });

    it('defaults the payout fee to 50 naira and reads it as a number', () => {
      expect(validateEnv(base).BACHS_PAYOUT_FEE).toBe(50);
      expect(
        validateEnv({ ...base, BACHS_PAYOUT_FEE: '75' }).BACHS_PAYOUT_FEE,
      ).toBe(75);
    });

    it('rejects a negative payout fee', () => {
      expect(() => validateEnv({ ...base, BACHS_PAYOUT_FEE: '-1' })).toThrow(
        'BACHS_PAYOUT_FEE',
      );
    });
  });
});
