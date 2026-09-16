import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';

export interface BetterAuthOptions {
  secret?: string;
  baseURL?: string;
  appURL?: string;
}

export function createBetterAuth(
  prisma: PrismaClient,
  options?: BetterAuthOptions,
) {
  const appURL =
    options?.appURL ||
    process.env.APP_URL ||
    'http://localhost:3001';

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
      sendResetPassword: async ({ user, url, token }) => {
        const resetUrl = `${appURL}/reset-password?token=${token}`;
        // TODO: Wire to InfrastructureNotificationsModule for production email delivery
        console.log(`[Auth] Password reset requested for ${user.email}`);
        console.log(`[Auth] Reset URL: ${resetUrl}`);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        const verifyUrl = `${appURL}/verify-email?token=${token}`;
        // TODO: Wire to InfrastructureNotificationsModule for production email delivery
        console.log(`[Auth] Email verification for ${user.email}`);
        console.log(`[Auth] Verify URL: ${verifyUrl}`);
      },
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
