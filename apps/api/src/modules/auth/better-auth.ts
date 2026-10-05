import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, genericOAuth } from 'better-auth/plugins';
import { PrismaClient } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { isMobileRequest } from '../../common/utils/client-detection.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { USER_EVENTS } from '../analytics/events/user.events';

export interface BetterAuthOptions {
  secret?: string;
  baseURL?: string;
}

export function generateAppleClientSecret(params: {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}): string {
  const { clientId, teamId, keyId, privateKey } = params;
  const normalizedKey = privateKey.replace(/\\n/g, '\n').trim();

  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
  ).toString('base64url');

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + 180 * 24 * 60 * 60, // 180 days (Apple maximum allowed)
      aud: 'https://appleid.apple.com',
      sub: clientId,
    }),
  ).toString('base64url');

  const data = `${header}.${payload}`;
  const sig = crypto
    .sign('sha256', Buffer.from(data), {
      key: normalizedKey,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');

  return `${data}.${sig}`;
}

export function resolveAppleClientSecret(): string {
  if (process.env.APPLE_CLIENT_SECRET) {
    return process.env.APPLE_CLIENT_SECRET;
  }
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;

  if (clientId && teamId && keyId && privateKey) {
    try {
      return generateAppleClientSecret({
        clientId,
        teamId,
        keyId,
        privateKey,
      });
    } catch (err) {
      console.warn('[BetterAuth] Failed to generate Apple client secret:', err);
      return '';
    }
  }
  return '';
}

function isEventEmitter(val: unknown): val is EventEmitter2 {
  return (
    val !== null &&
    typeof val === 'object' &&
    typeof (val as Record<string, unknown>).emit === 'function'
  );
}

export function createBetterAuth(
  prisma: PrismaClient,
  eventEmitterOrOptions?: EventEmitter2 | BetterAuthOptions,
  maybeOptions?: BetterAuthOptions,
) {
  let eventEmitter: EventEmitter2 | undefined;
  let options: BetterAuthOptions | undefined;

  if (isEventEmitter(eventEmitterOrOptions)) {
    eventEmitter = eventEmitterOrOptions;
    options = maybeOptions;
  } else if (
    eventEmitterOrOptions &&
    typeof eventEmitterOrOptions === 'object'
  ) {
    options = eventEmitterOrOptions;
    eventEmitter = undefined;
  } else {
    options = maybeOptions;
  }
  const emailFrom =
    process.env.EMAIL_FROM || 'BuyMeAYard <buymeayard@gmail.com>';
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
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
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
      'https://buymeayardbackend.onrender.com',
      'https://appleid.apple.com',
      'buymeayard://',
      'buymeayard://*',
      'bmay://',
      'bmay://*',
      'bmay-dev://',
      'bmay-dev://*',
      'bmay-preview://',
      'bmay-preview://*',
      'exp://',
      'exp://*',
      ...(process.env.ADDITIONAL_TRUSTED_ORIGINS
        ? process.env.ADDITIONAL_TRUSTED_ORIGINS.split(',').map((o) => o.trim())
        : []),
    ],
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    account: {
      modelName: 'authAccount',
      skipStateCookieCheck: true,
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
        requireLocalEmailVerified: false,
      },
    } as any,
    onAPIError: {
      errorURL:
        process.env.CREATOR_FRONTEND_URL ||
        process.env.FRONTEND_URL ||
        undefined,
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
        clientSecret: resolveAppleClientSecret(),
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
      sendResetPassword: async ({ user, url, token: _token }, request) => {
        const baseUrl = await getFrontendUrlForReset(user.id);
        let token =
          _token && _token !== 'null' && _token !== 'undefined'
            ? _token
            : undefined;
        if (!token) {
          try {
            const parsedUrl = new URL(url);
            token =
              parsedUrl.pathname
                .split('/reset-password/')[1]
                ?.split('/')[0]
                ?.split('?')[0] ||
              parsedUrl.searchParams.get('token') ||
              undefined;
          } catch {
            token = undefined;
          }
        }

        if (!token) {
          console.error(
            `[Auth] Could not extract reset password token for ${user.email} from url=${url}, token=${_token}`,
          );
        }

        // Determine if "from" param should be appended (e.g. ?from=mobile)
        let from: string | undefined;
        try {
          const callbackURL = new URL(url).searchParams.get('callbackURL');
          if (callbackURL) {
            const decoded = decodeURIComponent(callbackURL);
            const dummyUrl = new URL(decoded, 'http://localhost');
            from = dummyUrl.searchParams.get('from') || undefined;
          }
        } catch {
          // fallback
        }

        if (!from && request?.headers) {
          if (isMobileRequest(request.headers)) {
            from = 'mobile';
          }
        }

        const fromQuery = from ? `&from=${encodeURIComponent(from)}` : '';
        const frontendLink = `${baseUrl}/reset-password?token=${token || ''}${fromQuery}`;
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
        let token =
          _token && _token !== 'null' && _token !== 'undefined'
            ? _token
            : undefined;
        if (!token) {
          try {
            const parsedUrl = new URL(url);
            token =
              parsedUrl.searchParams.get('token') ||
              parsedUrl.pathname
                .split('/verify-email/')[1]
                ?.split('/')[0]
                ?.split('?')[0] ||
              undefined;
          } catch {
            token = undefined;
          }
        }

        if (!token) {
          console.error(
            `[Auth] Could not extract verification token for ${user.email} from url=${url}, token=${_token}`,
          );
        }

        const frontendLink = `${frontendUrls.creator}/verify-email?token=${token || ''}`;
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
      user: {
        create: {
          after: async (user: any) => {
            if (eventEmitter) {
              eventEmitter.emit(USER_EVENTS.CREATED, {
                userId: user.id,
                email: user.email,
                name: user.name ?? undefined,
              });
            }
          },
        },
      },
      /**
       * Session Creation Lifecycle Hook:
       * In Better Auth, `session.create` is invoked exclusively when a new user authentication
       * session is established (email/password sign-in, social OAuth callback, or new device login).
       * Token refreshes do NOT trigger `session.create` — Better Auth updates the existing session's
       * `expiresAt` via `session.update`.
       * Emitting `USER_EVENTS.LOGIN` here provides complete coverage across all sign-in vectors without
       * false positives from session refreshes.
       */
      session: {
        create: {
          after: async (session: any) => {
            if (eventEmitter) {
              try {
                const user = await prisma.user.findUnique({
                  where: { id: session.userId },
                  select: { email: true },
                });
                eventEmitter.emit(USER_EVENTS.LOGIN, {
                  userId: session.userId,
                  email: user?.email ?? '',
                  ipAddress: session.ipAddress ?? undefined,
                });
              } catch {
                // Non-blocking for session creation
              }
            }
          },
        },
      },
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
