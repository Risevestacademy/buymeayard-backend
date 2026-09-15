import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

export interface BetterAuthOptions {
  secret?: string;
  baseURL?: string;
}

export function createBetterAuth(
  prisma: PrismaClient,
  eventEmitter: EventEmitter2,
  options?: BetterAuthOptions,
) {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    account: {
      modelName: 'authAccount',
    },
    secret:
      options?.secret ||
      process.env.BETTER_AUTH_SECRET ||
      'super-secret-minimum-32-chars-key-for-development-change-me',
    baseURL:
      options?.baseURL ||
      process.env.BETTER_AUTH_URL ||
      'http://localhost:3000',
    basePath: '/api/v1/auth',
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    plugins: [bearer()],
  });
}

export type AuthInstance = ReturnType<typeof createBetterAuth>;
