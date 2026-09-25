import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, genericOAuth } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface BetterAuthOptions {
  secret?: string;
  baseURL?: string;
}

export function createBetterAuth(
  prisma: PrismaClient,
  options?: BetterAuthOptions,
) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resend = resendApiKey ? new Resend(resendApiKey) : null;
  const emailFrom = process.env.EMAIL_FROM || 'noreply@gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');

  // Frontend URLs per app
  const frontendUrls = {
    main: process.env.FRONTEND_URL || 'http://localhost:3000', // supporters (future use)
    creator: process.env.CREATOR_FRONTEND_URL || 'http://localhost:3001', // creators
    admin: process.env.ADMIN_FRONTEND_URL || 'http://localhost:3002', // admins
  };

  /**
   * Resolves the frontend URL for password reset emails.
   * - Admins → admin portal
   * - Everyone else (creators) → creator portal
   * Note: Verification emails always go to the creator portal
   * since only creators self-register (admins are seeded, supporters don't have accounts).
   */
  const getFrontendUrlForReset = async (userId: string): Promise<string> => {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    const roleNames = userRoles.map((r) => r.role.name);
    if (roleNames.includes('ADMIN') || roleNames.includes('SUPER_ADMIN')) {
      return frontendUrls.admin;
    }
    return frontendUrls.creator;
  };

  const smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465, // true for SSL (465), false for STARTTLS (587)
    connectionTimeout: 5000, // 5s connection timeout so blocked ports fail quickly
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const sendEmail = async (to: string, subject: string, html: string) => {
    try {
      if (process.env.BREVO_API_KEY) {
        // Brevo transactional email over HTTPS (port 443 — works seamlessly on Render/Railway)
        const match = emailFrom.match(/^(?:(.*)<)?([^>]+)>?$/);
        const senderName = match?.[1]?.trim() || 'BuyMeAYard';
        const senderEmail =
          match?.[2]?.trim() || process.env.SMTP_USER || 'buymeayard@gmail.com';

        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        });

        if (res.ok) {
          console.log(`[Auth] Email sent via Brevo API to ${to}: ${subject}`);
          return;
        }

        const errData = await res.json().catch(() => ({}));
        console.error(`[Auth] Brevo API error sending to ${to}:`, errData);
      }

      if (resend) {
        const result = await resend.emails.send({
          from: emailFrom,
          to,
          subject,
          html,
        });
        if (result.error) {
          console.error(
            `[Auth] Resend API error sending to ${to}:`,
            result.error,
          );
        } else {
          console.log(
            `[Auth] Email sent via Resend API to ${to} (id: ${result.data?.id}): ${subject}`,
          );
          return;
        }
      }

      await smtpTransport.sendMail({ from: emailFrom, to, subject, html });
      console.log(`[Auth] Email sent via SMTP to ${to}: ${subject}`);
    } catch (err) {
      console.error(`[Auth] Failed to send email to ${to}:`, err);
    }
  };

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
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url, token: _token }) => {
        const baseUrl = await getFrontendUrlForReset(user.id);
        const token = new URL(url).searchParams.get('token');
        const frontendLink = `${baseUrl}/reset-password?token=${token}`;
        sendEmail(
          user.email,
          'Reset Your Password - BuyMeAYard',
          `<p>Click the link below to reset your password:</p><p><a href="${frontendLink}">${frontendLink}</a></p>`,
        ).catch((err) =>
          console.error('[Auth] Failed to send password reset email:', err),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token: _token }) => {
        // Always use creator URL — only creators self-register
        const token = new URL(url).searchParams.get('token');
        const frontendLink = `${frontendUrls.creator}/verify-email?token=${token}`;
        sendEmail(
          user.email,
          'Verify Your Email - BuyMeAYard',
          `<p>Click the link below to verify your email address:</p><p><a href="${frontendLink}">${frontendLink}</a></p>`,
        ).catch((err) =>
          console.error('[Auth] Failed to send verification email:', err),
        );
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
              if (
                account.providerId === 'email' ||
                account.providerId === 'google' ||
                account.providerId === 'apple'
              ) {
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
                where: { userId: account.userId },
              });

              if (profile) {
                await prisma.creatorSocialLink.create({
                  data: {
                    creatorId: profile.id,
                    platform: provider,
                    url: url,
                  },
                });
                console.log(
                  `[Auth] Synced ${provider} social link for user ${account.userId}`,
                );
              }
            } catch (err) {
              console.error(`[Auth] Failed to sync social link:`, err);
            }
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            // No roles or profiles are assigned at registration.
            // Users complete onboarding explicitly via PUT /api/v1/creators/me/onboarding.
            console.log(`[Auth] New user registered: ${user.id}`);
          },
        },
      },
    },
    plugins: [
      bearer(),
      genericOAuth({
        config: [
          {
            providerId: 'instagram',
            clientId: process.env.INSTAGRAM_CLIENT_ID || '',
            clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
            authorizationUrl: 'https://api.instagram.com/oauth/authorize',
            tokenUrl: 'https://api.instagram.com/oauth/access_token',
            userInfoUrl: 'https://graph.instagram.com/me?fields=id,username',
            scopes: ['user_profile'],
          },
          {
            providerId: 'tiktok',
            clientId: process.env.TIKTOK_CLIENT_KEY || '',
            clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
            authorizationUrl: 'https://www.tiktok.com/v2/auth/authorize/',
            tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
            userInfoUrl: 'https://open.tiktokapis.com/v2/user/info/',
            scopes: ['user.info.basic'],
          },
        ],
      }),
    ],
  });
}

export type AuthInstance = ReturnType<typeof createBetterAuth>;
