import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@buymeayard/types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ErrorCodes } from '../errors/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'No user authenticated to check permissions',
      });
    }

    const userRoles: UserRole[] = user.roles || (user.role ? [user.role] : []);
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'You do not have the required permissions for this action',
      });
    }

    return true;
  }
}
