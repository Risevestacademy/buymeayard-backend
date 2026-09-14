import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ErrorCodes } from '../errors/error-codes';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Resolve session using Better Auth from request headers (supports cookies and Bearer token)
    const sessionData = await this.authService.getSessionFromNodeHeaders(
      request.headers,
    );

    if (!sessionData || !sessionData.user) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Authentication required to access this resource',
      });
    }

    // Query active user state and assigned roles from the database
    const dbUser = await this.prisma.user.findUnique({
      where: { id: sessionData.user.id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!dbUser) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'User account not found',
      });
    }

    // Enforce administrative account restrictions
    if (
      dbUser.status === 'SUSPENDED' ||
      dbUser.status === 'BANNED' ||
      dbUser.status === 'DEACTIVATED'
    ) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: `Account is ${dbUser.status.toLowerCase()}. Access denied.`,
      });
    }

    const roles = dbUser.roles.map((r) => r.role.name);

    // Attach verified user and session to request
    request.user = {
      ...sessionData.user,
      status: dbUser.status,
      roles,
    };
    request.session = sessionData.session;

    return true;
  }
}
