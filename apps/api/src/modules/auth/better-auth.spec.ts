import { createBetterAuth } from './better-auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { USER_EVENTS } from '../analytics/events/user.events';
import { betterAuth } from 'better-auth';

jest.mock('better-auth', () => ({
  betterAuth: jest.fn((config) => ({
    _config: config,
    api: {},
  })),
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
});
