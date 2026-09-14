import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '@buymeayard/types';

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;

    rolesGuard = new RolesGuard(reflector);
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  };

  it('should return true if no roles are required for route', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext(null);

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user is not attached to request', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext(null);

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException if user does not have required role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    const context = createMockContext({
      id: 'user-1',
      roles: [UserRole.SUPPORTER],
    });

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should return true if user has one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.ADMIN,
      UserRole.CREATOR,
    ]);
    const context = createMockContext({
      id: 'user-1',
      roles: [UserRole.CREATOR],
    });

    expect(rolesGuard.canActivate(context)).toBe(true);
  });
});
