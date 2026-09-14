import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fromNodeHeaders } from '../../common/utils/headers.util';
import type { IncomingHttpHeaders } from 'http';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { createBetterAuth, AuthInstance } from './better-auth';

@Injectable()
export class AuthService implements OnModuleInit {
  private auth!: AuthInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.auth = createBetterAuth(this.prisma, {
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
}
