import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Resend } from 'resend';
import { createAuthMiddleware } from 'better-auth/api';

export interface BetterAuthOptions {
  secret?: string;
  baseURL?: string;
}

export function createBetterAuth(
  prisma: PrismaClient,
  eventEmitter: EventEmitter2,
  options?: BetterAuthOptions,
) {
  const resend = new Resend(process.env.RESEND_API_KEY || 're_mock');
  const emailFrom = process.env.EMAIL_FROM || 'noreply@buymeayard.com';

  return betterAuth({
    trustedOrigins: [
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
    plugins: [bearer()],

     // --- Added: emit user.created after a user row is actually created ---
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            eventEmitter.emit('user.created', {
              userId: user.id,
              email: user.email,
              name: user.name,
            });
          },
        },
      },
    },

    // --- Added: emit user.login specifically on the sign-in endpoint ---
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/email' && ctx.context.returned) {
          const returned = ctx.context.returned as { user?: { id: string; email: string } };
          if (returned.user) {
            eventEmitter.emit('user.login', {
              userId: returned.user.id,
              email: returned.user.email,
              ipAddress: ctx.request?.headers.get('x-forwarded-for') ?? undefined,
            });
          }
        }
      }),
    },
  });
}

export type AuthInstance = ReturnType<typeof createBetterAuth>;
