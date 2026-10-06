import {
  createBetterAuth,
  generateAppleClientSecret,
  resolveAppleClientSecret,
} from './better-auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { USER_EVENTS } from '../analytics/events/user.events';
import { betterAuth } from 'better-auth';
import * as crypto from 'crypto';

jest.mock('better-auth', () => ({
  betterAuth: jest.fn((config) => ({
    _config: config,
    api: {},
  })),
  APIError: class MockAPIError extends Error {
    status: string;
    body: any;
    constructor(status: string, body?: any) {
      super(body?.message || status);
      this.status = status;
      this.body = body;
    }
  },
}));

jest.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: jest.fn(() => ({})),
}));

jest.mock('better-auth/plugins', () => ({
  bearer: jest.fn(() => ({})),
  genericOAuth: jest.fn(() => ({})),
}));

describe('createBetterAuth', () => {
  let mockPrisma: any;
  let mockEventEmitter: EventEmitter2;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      userRole: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      creatorProfile: {
        findUnique: jest.fn(),
      },
    };
    mockEventEmitter = {
      emit: jest.fn(),
    } as unknown as EventEmitter2;
  });

  describe('parameter resolution and backwards compatibility', () => {
    it('should correctly handle createBetterAuth with only prisma', () => {
      createBetterAuth(mockPrisma);
      expect(betterAuth).toHaveBeenCalled();
    });

    it('should correctly preserve empty options object createBetterAuth(prisma, {})', () => {
      createBetterAuth(mockPrisma, {});
      expect(betterAuth).toHaveBeenCalled();
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];
      // Should fall back to default secret and baseURL without treating {} as an EventEmitter2
      expect(passedConfig.secret).toBeDefined();
      expect(passedConfig.baseURL).toBeDefined();
    });

    it('should correctly configure custom options when passed as second argument', () => {
      createBetterAuth(mockPrisma, {
        secret: 'custom-secret-key-32-chars-long-here',
        baseURL: 'https://api.custom.com',
      });
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];
      expect(passedConfig.secret).toBe('custom-secret-key-32-chars-long-here');
      expect(passedConfig.baseURL).toBe('https://api.custom.com');
    });

    it('should correctly identify EventEmitter2 instance when passed as second argument', () => {
      createBetterAuth(mockPrisma, mockEventEmitter);
      expect(betterAuth).toHaveBeenCalled();
    });

    it('should correctly handle both EventEmitter2 and custom options', () => {
      createBetterAuth(mockPrisma, mockEventEmitter, {
        secret: 'dual-args-custom-secret-key-32-chars',
        baseURL: 'https://dual.custom.com',
      });
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];
      expect(passedConfig.secret).toBe('dual-args-custom-secret-key-32-chars');
      expect(passedConfig.baseURL).toBe('https://dual.custom.com');
    });
  });

  describe('databaseHooks event emission', () => {
    it('should emit USER_EVENTS.CREATED when a new user is created in databaseHooks', async () => {
      createBetterAuth(mockPrisma, mockEventEmitter);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      expect(passedConfig.databaseHooks?.user?.create?.after).toBeDefined();

      const user = {
        id: 'new-user-1',
        email: 'test@example.com',
        name: 'Test Creator',
      };

      await passedConfig.databaseHooks.user.create.after(user);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(USER_EVENTS.CREATED, {
        userId: 'new-user-1',
        email: 'test@example.com',
        name: 'Test Creator',
      });
    });

    it('should emit USER_EVENTS.LOGIN when a new session is created in databaseHooks', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-42',
        email: 'logged-in@example.com',
      });

      createBetterAuth(mockPrisma, mockEventEmitter);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      expect(passedConfig.databaseHooks?.session?.create?.after).toBeDefined();

      const session = {
        id: 'sess-123',
        userId: 'user-42',
        ipAddress: '203.0.113.195',
      };

      await passedConfig.databaseHooks.session.create.after(session);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-42' },
        select: { email: true },
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(USER_EVENTS.LOGIN, {
        userId: 'user-42',
        email: 'logged-in@example.com',
        ipAddress: '203.0.113.195',
      });
    });

    it('should safely no-op event emission when eventEmitter is not provided', async () => {
      createBetterAuth(mockPrisma, {});
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      await expect(
        passedConfig.databaseHooks.user.create.after({
          id: 'u-1',
          email: 'no-ee@example.com',
        }),
      ).resolves.not.toThrow();

      await expect(
        passedConfig.databaseHooks.session.create.after({
          id: 's-1',
          userId: 'u-1',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('Apple OAuth secret generation and configuration', () => {
    const origEnv = process.env;

    beforeEach(() => {
      process.env = { ...origEnv };
    });

    afterAll(() => {
      process.env = origEnv;
    });

    it('should generate a valid ES256 JWT using generateAppleClientSecret', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const privPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string;
      const pubPem = publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      const jwt = generateAppleClientSecret({
        clientId: 'com.buymeayard.web',
        teamId: 'TEAM123456',
        keyId: 'KEY1234567',
        privateKey: privPem,
      });

      expect(typeof jwt).toBe('string');
      const parts = jwt.split('.');
      expect(parts.length).toBe(3);

      const header = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString('utf8'),
      );
      expect(header.alg).toBe('ES256');
      expect(header.kid).toBe('KEY1234567');

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      );
      expect(payload.iss).toBe('TEAM123456');
      expect(payload.sub).toBe('com.buymeayard.web');
      expect(payload.aud).toBe('https://appleid.apple.com');

      const isValid = crypto.verify(
        'sha256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        { key: pubPem, dsaEncoding: 'ieee-p1363' },
        Buffer.from(parts[2], 'base64url'),
      );
      expect(isValid).toBe(true);
    });

    it('should prioritize APPLE_CLIENT_SECRET if already set in environment', () => {
      process.env.APPLE_CLIENT_SECRET = 'pre-generated-apple-secret-jwt';
      const secret = resolveAppleClientSecret();
      expect(secret).toBe('pre-generated-apple-secret-jwt');
    });

    it('should dynamically resolve Apple client secret when private key credentials are set', () => {
      delete process.env.APPLE_CLIENT_SECRET;
      const { privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      const privPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string;

      process.env.APPLE_CLIENT_ID = 'com.buymeayard.web';
      process.env.APPLE_TEAM_ID = 'TEAM999999';
      process.env.APPLE_KEY_ID = 'KEY9999999';
      process.env.APPLE_PRIVATE_KEY = privPem;

      const secret = resolveAppleClientSecret();
      expect(typeof secret).toBe('string');
      expect(secret.split('.').length).toBe(3);
    });

    it('should include Render, Apple, and mobile redirect schemes in trustedOrigins', () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      expect(passedConfig.trustedOrigins).toContain(
        'https://buymeayardbackend.onrender.com',
      );
      expect(passedConfig.trustedOrigins).toContain(
        'https://appleid.apple.com',
      );
      expect(passedConfig.trustedOrigins).toContain('bmay://');
      expect(passedConfig.trustedOrigins).toContain('bmay-dev://');
      expect(passedConfig.trustedOrigins).toContain('bmay-preview://');
    });

    it('should configure Google and Apple account linking with requireLocalEmailVerified disabled', () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      expect(passedConfig.account?.accountLinking).toEqual({
        enabled: true,
        trustedProviders: ['google', 'apple'],
        requireLocalEmailVerified: false,
      });
    });

    it('should configure disableSignUp: true on all social providers', () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      expect(passedConfig.socialProviders.google.disableSignUp).toBe(true);
      expect(passedConfig.socialProviders.apple.disableSignUp).toBe(true);
      expect(passedConfig.socialProviders.twitter.disableSignUp).toBe(true);
      expect(passedConfig.socialProviders.facebook.disableSignUp).toBe(true);
    });
  });

  describe('mobile gating databaseHooks', () => {
    it('should reject mobile registration attempts with REGISTRATION_WEB_ONLY', async () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      expect(passedConfig.databaseHooks?.user?.create?.before).toBeDefined();

      const contextWithMobileHeader = {
        headers: { 'x-client-type': 'mobile' },
      };

      await expect(
        passedConfig.databaseHooks.user.create.before(
          { id: 'user-new', email: 'test@example.com' },
          contextWithMobileHeader,
        ),
      ).rejects.toThrow();

      try {
        await passedConfig.databaseHooks.user.create.before(
          { id: 'user-new', email: 'test@example.com' },
          contextWithMobileHeader,
        );
      } catch (err: any) {
        expect(err.body?.code).toBe('REGISTRATION_WEB_ONLY');
      }
    });

    it('should allow web registration in user.create.before', async () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const webContext = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0' },
      };

      await expect(
        passedConfig.databaseHooks.user.create.before(
          { id: 'user-web', email: 'web@example.com' },
          webContext,
        ),
      ).resolves.not.toThrow();
    });

    it('should reject mobile session creation for non-creator with MOBILE_ACCESS_DENIED', async () => {
      mockPrisma.userRole.findFirst = jest.fn().mockResolvedValue(null);

      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const mobileContext = {
        headers: { 'x-client-type': 'mobile' },
      };

      await expect(
        passedConfig.databaseHooks.session.create.before(
          { id: 's-1', userId: 'supporter-1' },
          mobileContext,
        ),
      ).rejects.toThrow();

      try {
        await passedConfig.databaseHooks.session.create.before(
          { id: 's-1', userId: 'supporter-1' },
          mobileContext,
        );
      } catch (err: any) {
        expect(err.body?.code).toBe('MOBILE_ACCESS_DENIED');
      }
    });

    it('should allow mobile session creation for creator users', async () => {
      mockPrisma.userRole.findFirst = jest.fn().mockResolvedValue({
        id: 'ur-1',
        userId: 'creator-1',
        role: { name: 'CREATOR' },
      });

      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const mobileContext = {
        headers: { 'x-client-type': 'mobile' },
      };

      await expect(
        passedConfig.databaseHooks.session.create.before(
          { id: 's-2', userId: 'creator-1' },
          mobileContext,
        ),
      ).resolves.not.toThrow();
    });

    it('should allow web session creation for any user', async () => {
      mockPrisma.userRole.findFirst = jest.fn().mockResolvedValue(null);

      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const webContext = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0' },
      };

      await expect(
        passedConfig.databaseHooks.session.create.before(
          { id: 's-3', userId: 'supporter-1' },
          webContext,
        ),
      ).resolves.not.toThrow();
    });

    it('should reject OAuth registration attempts when oauthState has a mobile callbackURL', async () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const oauthMobileContext = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0' },
        oauthState: {
          callbackURL: 'bmay-dev://oauth-callback',
        },
      };

      await expect(
        passedConfig.databaseHooks.user.create.before(
          { id: 'user-new', email: 'oauth@example.com' },
          oauthMobileContext,
        ),
      ).rejects.toThrow();

      try {
        await passedConfig.databaseHooks.user.create.before(
          { id: 'user-new', email: 'oauth@example.com' },
          oauthMobileContext,
        );
      } catch (err: any) {
        expect(err.body?.code).toBe('REGISTRATION_WEB_ONLY');
      }
    });

    it('should reject OAuth session creation for non-creator when oauthState has a mobile callbackURL', async () => {
      mockPrisma.userRole.findFirst = jest.fn().mockResolvedValue(null);

      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const oauthMobileContext = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0' },
        oauthState: {
          callbackURL: 'bmay-dev://oauth-callback',
        },
      };

      await expect(
        passedConfig.databaseHooks.session.create.before(
          { id: 's-oauth-1', userId: 'non-creator-user' },
          oauthMobileContext,
        ),
      ).rejects.toThrow();

      try {
        await passedConfig.databaseHooks.session.create.before(
          { id: 's-oauth-1', userId: 'non-creator-user' },
          oauthMobileContext,
        );
      } catch (err: any) {
        expect(err.body?.code).toBe('MOBILE_ACCESS_DENIED');
      }
    });

    it('should allow OAuth session creation for creator users when oauthState has a mobile callbackURL', async () => {
      mockPrisma.userRole.findFirst = jest.fn().mockResolvedValue({
        id: 'ur-1',
        userId: 'creator-oauth-user',
        role: { name: 'CREATOR' },
      });

      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const oauthMobileContext = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0' },
        oauthState: {
          callbackURL: 'bmay-dev://oauth-callback',
        },
      };

      await expect(
        passedConfig.databaseHooks.session.create.before(
          { id: 's-oauth-2', userId: 'creator-oauth-user' },
          oauthMobileContext,
        ),
      ).resolves.not.toThrow();
    });

    it('should automatically set errorCallbackURL in hooks.before when social sign-in has a mobile callbackURL', async () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const ctx: any = {
        path: '/sign-in/social',
        headers: {},
        body: {
          callbackURL: 'buymeayard://oauth-callback',
        },
      };

      await passedConfig.hooks.before(ctx);

      expect(ctx.body.errorCallbackURL).toBe('buymeayard://oauth-callback');
    });

    it('should reject weak newPassword in hooks.before on /reset-password', async () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const weakCtx: any = {
        path: '/reset-password',
        headers: {},
        body: {
          token: 'some-token',
          newPassword: 'weakpassword',
        },
      };

      await expect(passedConfig.hooks.before(weakCtx)).rejects.toThrow();

      try {
        await passedConfig.hooks.before(weakCtx);
      } catch (err: any) {
        expect(err.body?.code).toBe('INVALID_PASSWORD');
      }
    });

    it('should allow strong newPassword in hooks.before on /reset-password', async () => {
      createBetterAuth(mockPrisma);
      const passedConfig = (betterAuth as jest.Mock).mock.calls[0][0];

      const strongCtx: any = {
        path: '/reset-password',
        headers: {},
        body: {
          token: 'some-token',
          newPassword: 'StrongPassword123!',
        },
      };

      await expect(passedConfig.hooks.before(strongCtx)).resolves.not.toThrow();
    });
  });
});
