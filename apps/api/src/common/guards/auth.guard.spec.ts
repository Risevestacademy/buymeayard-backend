import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

jest.mock('../../modules/auth/better-auth', () => ({
  createBetterAuth: jest.fn(),
}));

import { AuthGuard } from './auth.guard';
import { AuthService } from '../../modules/auth/auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('AuthGuard', () => {
  let authGuard: AuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let authService: {
    getSessionFromNodeHeaders: jest.Mock;
  };
  let prismaService: {
    user: {
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    authService = {
      getSessionFromNodeHeaders: jest.fn(),
    };

    prismaService = {
      user: {
        findUnique: jest.fn(),
      },
    };

    authGuard = new AuthGuard(
      reflector,
      authService as unknown as AuthService,
      prismaService as unknown as PrismaService,
    );
  });

  const createMockContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    const request = { headers, user: null, session: null };
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any;
  };

  it('should allow access if route is decorated with @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const result = await authGuard.canActivate(context);
    expect(result).toBe(true);
    expect(authService.getSessionFromNodeHeaders).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException if no session is returned', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getSessionFromNodeHeaders.mockResolvedValue(null as any);
    const context = createMockContext();

    await expect(authGuard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if user does not exist in database', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getSessionFromNodeHeaders.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
      session: { id: 'session-1' },
    } as any);
    prismaService.user.findUnique.mockResolvedValue(null);
    const context = createMockContext();

    await expect(authGuard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw ForbiddenException if user status is SUSPENDED or BANNED', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getSessionFromNodeHeaders.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
      session: { id: 'session-1' },
    } as any);
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'SUSPENDED',
      roles: [],
    });
    const context = createMockContext();

    await expect(authGuard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should attach user and session and allow access for active user', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    authService.getSessionFromNodeHeaders.mockResolvedValue({
      user: { id: 'user-1', email: 'test@example.com' },
      session: { id: 'session-1' },
    } as any);
    prismaService.user.findUnique.mockResolvedValue({
      id: 'user-1',
      status: 'ACTIVE',
      roles: [{ role: { name: 'CREATOR' } }],
    });
    const context = createMockContext();

    const result = await authGuard.canActivate(context);
    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest();
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      status: 'ACTIVE',
      roles: ['CREATOR'],
    });
    expect(req.session).toEqual({ id: 'session-1' });
  });
});
