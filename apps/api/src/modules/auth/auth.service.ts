import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fromNodeHeaders } from '../../common/utils/headers.util';
import type { IncomingHttpHeaders } from 'http';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { createBetterAuth, AuthInstance } from './better-auth';

@Injectable()
export class AuthService implements OnModuleInit {
  private auth!: AuthInstance;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.auth = createBetterAuth(this.prisma, {
      secret: this.configService.get<string>('BETTER_AUTH_SECRET'),
      baseURL: this.configService.get<string>('BETTER_AUTH_URL'),
      appURL: this.configService.get<string>('APP_URL'),
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
}
