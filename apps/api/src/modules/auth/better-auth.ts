import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';

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
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID || '',
        clientSecret: process.env.APPLE_CLIENT_SECRET || '',
      },
      twitter: {
        clientId: process.env.TWITTER_CLIENT_ID || '',
        clientSecret: process.env.TWITTER_CLIENT_SECRET || '',
      },
      facebook: {
        clientId: process.env.FACEBOOK_CLIENT_ID || '',
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
      },
      instagram: {
        clientId: process.env.INSTAGRAM_CLIENT_ID || '',
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
      },
      tiktok: {
        clientKey: process.env.TIKTOK_CLIENT_KEY || '',
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
      },
      youtube: {
        clientId: process.env.YOUTUBE_CLIENT_ID || '',
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
      },
    },
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
    databaseHooks: {
      account: {
        create: {
          after: async (account) => {
            try {
              if (account.providerId === 'email' || account.providerId === 'google' || account.providerId === 'apple') {
                return; // We don't link these as public social links for now (unless Google is for YouTube)
              }
              
              let url = '';
              const provider = account.providerId;
              const accountId = account.accountId; // The user ID on the social platform

              switch (provider) {
                case 'twitter':
                  url = `https://x.com/intent/user?user_id=${accountId}`;
                  break;
                case 'facebook':
                  url = `https://facebook.com/${accountId}`;
                  break;
                case 'instagram':
                  url = `https://instagram.com/${accountId}`;
                  break;
                case 'tiktok':
                  url = `https://tiktok.com/@${accountId}`;
                  break;
                case 'youtube':
                  url = `https://youtube.com/channel/${accountId}`;
                  break;
                default:
                  url = `https://${provider}.com/${accountId}`;
              }

              const profile = await prisma.creatorProfile.findUnique({
                where: { userId: account.userId }
              });

              if (profile) {
                await prisma.creatorSocialLink.create({
                  data: {
                    creatorId: profile.id,
                    platform: provider,
                    url: url,
                  }
                });
                console.log(`[Auth] Synced ${provider} social link for user ${account.userId}`);
              }
            } catch (err) {
              console.error(`[Auth] Failed to sync social link:`, err);
            }
          }
        }
      },
      user: {
        create: {
          after: async (user) => {
            try {
              // Ensure role CREATOR exists
              const role = await prisma.role.upsert({
                where: { name: 'CREATOR' },
                update: {},
                create: { name: 'CREATOR' },
              });

              // Assign CREATOR role
              await prisma.userRole.create({
                data: {
                  userId: user.id,
                  roleId: role.id,
                },
              });

              // Initialize CreatorProfile
              const fallbackUsername = user.email.split('@')[0] + '-' + randomBytes(4).toString('hex');
              
              await prisma.creatorProfile.create({
                data: {
                  userId: user.id,
                  username: fallbackUsername,
                  displayName: user.name || user.email.split('@')[0],
                  status: 'REGISTERED',
                  kycStatus: 'NOT_SUBMITTED',
                },
              });

              console.log(`[Auth] Provisioned CREATOR profile for user ${user.id}`);
            } catch (err) {
              console.error(`[Auth] Failed to provision CREATOR profile for user ${user.id}:`, err);
            }
          },
        },
      },
    },
    plugins: [bearer()],
  });
}

export type AuthInstance = ReturnType<typeof createBetterAuth>;
