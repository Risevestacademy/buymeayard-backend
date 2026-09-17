import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fromNodeHeaders } from '../../common/utils/headers.util';
import type { IncomingHttpHeaders } from 'http';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { createBetterAuth, AuthInstance } from './better-auth';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RegisterCreatorDto } from './dto/register-creator.dto';


@Injectable()
export class AuthService implements OnModuleInit {
  private auth!: AuthInstance;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.auth = createBetterAuth(this.prisma, this.eventEmitter, {
      secret: this.configService.get<string>('BETTER_AUTH_SECRET'),
      baseURL: this.configService.get<string>('BETTER_AUTH_URL'),
    });
  }

  getAuth(): AuthInstance {
    if (!this.auth) {
      this.onModuleInit();
    }
    return this.auth;
  }

  async getSessionFromHeaders(headers: Headers) {
    return this.getAuth().api.getSession({
      headers,
    });
  }

  async getSessionFromNodeHeaders(nodeHeaders: IncomingHttpHeaders) {
    const headers = fromNodeHeaders(nodeHeaders);
    return this.getSessionFromHeaders(headers);
  }

  /**
   * Register a new user and auto-assign the SUPPORTER role.
   * Every account starts as a supporter by default.
   */
  async signUpEmailWithRole(params: {
    email: string;
    password: string;
    name?: string;
    headers?: Headers;
  }): Promise<globalThis.Response> {
    const webRes = await this.signUpEmail(params);

    // Only assign role if registration succeeded
    if (webRes.ok) {
      try {
        // Clone the response so we can read the body without consuming the original
        const cloned = webRes.clone();
        const body = await cloned.json();
        const userId = body?.user?.id;

        if (userId) {
          await this.assignSupporterRole(userId);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to assign SUPPORTER role after registration: ${error}`,
        );
      }
    }

    return webRes;
  }

  /**
   * Register a new user and auto-assign the CREATOR role,
   * initializing their CreatorProfile.
   */
  async signUpCreator(
    dto: RegisterCreatorDto,
    headers?: Headers,
  ): Promise<globalThis.Response> {
    const webRes = await this.signUpEmail({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      headers,
    });

    // Only assign role and profile if registration succeeded
    if (webRes.ok) {
      try {
        const cloned = webRes.clone();
        const body = await cloned.json();
        const userId = body?.user?.id;

        if (userId) {
          await this.assignCreatorRoleAndProfile(userId, dto);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to assign CREATOR role/profile after registration: ${error}`,
        );
      }
    }

    return webRes;
  }

  async signUpEmail(params: {
    email: string;
    password: string;
    name?: string;
    headers?: Headers;
  }): Promise<globalThis.Response> {
    return this.getAuth().api.signUpEmail({
      body: {
        email: params.email,
        password: params.password,
        name: params.name || params.email.split('@')[0],
      },
      ...(params.headers ? { headers: params.headers } : {}),
      asResponse: true,
    });
  }

  async signInEmail(params: {
    email: string;
    password: string;
    headers?: Headers;
  }): Promise<globalThis.Response> {
    return this.getAuth().api.signInEmail({
      body: {
        email: params.email,
        password: params.password,
      },
      ...(params.headers ? { headers: params.headers } : {}),
      asResponse: true,
    });
  }

  async signOut(params?: { headers?: Headers }): Promise<globalThis.Response> {
    const headers = params?.headers || new Headers();
    return this.getAuth().api.signOut({
      headers,
      asResponse: true,
    });
  }

  async forgotPassword(params: {
    email: string;
    headers?: Headers;
  }): Promise<globalThis.Response> {
    return this.getAuth().api.requestPasswordReset({
      body: {
        email: params.email,
        redirectTo: '/reset-password',
      },
      ...(params.headers ? { headers: params.headers } : {}),
      asResponse: true,
    });
  }

  async resetPassword(params: {
    token: string;
    newPassword: string;
  }): Promise<globalThis.Response> {
    return this.getAuth().api.resetPassword({
      body: {
        token: params.token,
        newPassword: params.newPassword,
      },
      asResponse: true,
    });
  }

  async changePassword(params: {
    currentPassword: string;
    newPassword: string;
    headers: Headers;
  }): Promise<globalThis.Response> {
    return this.getAuth().api.changePassword({
      body: {
        currentPassword: params.currentPassword,
        newPassword: params.newPassword,
      },
      headers: params.headers,
      asResponse: true,
    });
  }

  async verifyEmail(params: { token: string }): Promise<globalThis.Response> {
    return this.getAuth().api.verifyEmail({
      query: {
        token: params.token,
      },
      asResponse: true,
    });
  }

  async sendVerificationEmail(params: {
    email: string;
    headers: Headers;
  }): Promise<globalThis.Response> {
    return this.getAuth().api.sendVerificationEmail({
      body: {
        email: params.email,
      },
      headers: params.headers,
      asResponse: true,
    });
  }

  /**
   * Check if a user has a specific role.
   */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: { name: roleName },
      },
    });
    return !!userRole;
  }

  /**
   * Assign the SUPPORTER role to a newly registered user.
   */
  private async assignSupporterRole(userId: string): Promise<void> {
    const supporterRole = await this.prisma.role.findUnique({
      where: { name: 'SUPPORTER' },
    });

    if (!supporterRole) {
      this.logger.error(
        'SUPPORTER role not found in database. Run seeds first.',
      );
      return;
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: supporterRole.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: supporterRole.id,
      },
    });

    this.logger.log(`Assigned SUPPORTER role to user ${userId}`);
  }

  /**
   * Assign the CREATOR role and initialize the CreatorProfile.
   */
  private async assignCreatorRoleAndProfile(
    userId: string,
    dto: RegisterCreatorDto,
  ): Promise<void> {
    const creatorRole = await this.prisma.role.findUnique({
      where: { name: 'CREATOR' },
    });

    if (!creatorRole) {
      this.logger.error('CREATOR role not found in database. Run seeds first.');
      return;
    }

    // Run this in a transaction to ensure both role and profile are created together
    await this.prisma.$transaction(async (tx) => {
      // 1. Assign Role
      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: creatorRole.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: creatorRole.id,
        },
      });

      // 2. Create Profile
      await tx.creatorProfile.create({
        data: {
          userId,
          username: dto.username,
          displayName: dto.name,
          bio: dto.bio || null,
          categoryId: dto.categoryId || null,
          status: 'REGISTERED',
          kycStatus: 'NOT_SUBMITTED',
        },
      });
    });

    this.logger.log(
      `Assigned CREATOR role and initialized profile for user ${userId}`,
    );
  }
}
