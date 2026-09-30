import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

export interface BetterAuthOptions {
  secret?: string;
  baseURL?: string;
}

export function createBetterAuth(
  prisma: PrismaClient,
  options?: BetterAuthOptions,
) {
  const resend = new Resend(process.env.RESEND_API_KEY || 're_mock');
  const emailFrom = process.env.EMAIL_FROM || 'noreply@buymeayard.com';

  return betterAuth({
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'https://buymeayard-main-dev.up.railway.app',
      'https://buymeayard-creator-dev.up.railway.app',
      'https://buymeayard-admin-dev.up.railway.app',
    ],
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
      sendResetPassword: async ({ user, url, token: _token }) => {
        if (process.env.RESEND_API_KEY) {
          await resend.emails.send({
            from: emailFrom,
            to: user.email,
            subject: 'Reset Your Password - BuyMeAYard',
            html: `<p>Click the link below to reset your password:</p><p><a href="${url}">${url}</a></p>`,
          });
          console.log(
            `[Auth] Password reset email sent via Resend to ${user.email}`,
          );
        } else {
          console.log(`[Auth] Password reset requested for ${user.email}`);
          console.log(
            `[Auth] Reset URL (Add RESEND_API_KEY to send emails): ${url}`,
          );
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token: _token }) => {
        if (process.env.RESEND_API_KEY) {
          await resend.emails.send({
            from: emailFrom,
            to: user.email,
            subject: 'Verify Your Email - BuyMeAYard',
            html: `<p>Click the link below to verify your email address:</p><p><a href="${url}">${url}</a></p>`,
          });
          console.log(
            `[Auth] Verification email sent via Resend to ${user.email}`,
          );
        } else {
          console.log(`[Auth] Email verification for ${user.email}`);
          console.log(
            `[Auth] Verify URL (Add RESEND_API_KEY to send emails): ${url}`,
          );
        }
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
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
      },
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
      },
    },
    plugins: [bearer()],
  });
}

export type AuthInstance = ReturnType<typeof createBetterAuth>;
