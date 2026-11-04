import type { PrismaClient } from '@prisma/client';

/**
 * Turns a connected OAuth account into a verified creator social link.
 * The provider is asked who the account is, and the answer is stored as that
 * platform's profile URL. Nothing is stored if the provider gives no handle.
 */

/** Better Auth provider id -> creator social link platform. */
export const PROVIDER_PLATFORM: Record<string, string> = {
  youtube: 'youtube',
  twitch: 'twitch',
  twitter: 'x',
  facebook: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  discord: 'discord',
};

type Fetcher = typeof fetch;

interface ConnectedAccount {
  userId: string;
  providerId: string;
  accountId: string;
  accessToken?: string | null;
}

async function getJson(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
): Promise<any> {
  const res = await fetcher(url, { headers });
  return res.ok ? res.json() : null;
}

/** Returns the profile URL for a connected account, or null. */
export async function fetchProfileUrl(
  account: ConnectedAccount,
  fetcher: Fetcher = fetch,
): Promise<string | null> {
  const token = account.accessToken;
  if (!token) return null;
  const bearer = { Authorization: `Bearer ${token}` };

  switch (account.providerId) {
    case 'twitter': {
      const body = await getJson(
        fetcher,
        'https://api.twitter.com/2/users/me',
        bearer,
      );
      const name = body?.data?.username;
      return name ? `https://x.com/${name}` : null;
    }
    case 'facebook': {
      // `link` is only returned once the app has the user_link permission.
      const body = await getJson(
        fetcher,
        `https://graph.facebook.com/me?fields=id,link&access_token=${encodeURIComponent(token)}`,
        {},
      );
      return typeof body?.link === 'string' ? body.link : null;
    }
    case 'instagram': {
      const body = await getJson(
        fetcher,
        `https://graph.instagram.com/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`,
        {},
      );
      return body?.username ? `https://instagram.com/${body.username}` : null;
    }
    case 'tiktok': {
      const body = await getJson(
        fetcher,
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,username',
        bearer,
      );
      const name = body?.data?.user?.username;
      return name ? `https://tiktok.com/@${name}` : null;
    }
    case 'twitch': {
      const body = await getJson(fetcher, 'https://api.twitch.tv/helix/users', {
        ...bearer,
        'Client-Id': process.env.TWITCH_CLIENT_ID || '',
      });
      const login = body?.data?.[0]?.login;
      return login ? `https://twitch.tv/${login}` : null;
    }
    case 'discord': {
      // Discord has no vanity profile URL; this link opens the user's profile.
      const body = await getJson(
        fetcher,
        'https://discord.com/api/users/@me',
        bearer,
      );
      return body?.id ? `https://discord.com/users/${body.id}` : null;
    }
    case 'youtube': {
      const body = await getJson(
        fetcher,
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        bearer,
      );
      const channel = body?.items?.[0];
      if (!channel) return null;
      const handle = channel.snippet?.customUrl;
      return handle
        ? `https://youtube.com/${String(handle).startsWith('@') ? handle : `@${handle}`}`
        : `https://youtube.com/channel/${channel.id}`;
    }
    default:
      return null;
  }
}

/**
 * Stores the connected account as a verified link on the user's creator
 * profile. Never throws: a failed sync must not break the OAuth flow.
 */
export async function syncSocialLink(
  prisma: PrismaClient,
  account: ConnectedAccount,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const platform = PROVIDER_PLATFORM[account.providerId];
  if (!platform) return;
  try {
    const profile = await prisma.creatorProfile.findUnique({
      where: { userId: account.userId },
      select: { id: true },
    });
    if (!profile) return;

    const url = await fetchProfileUrl(account, fetcher);
    if (!url) {
      console.warn(
        `[Auth] ${account.providerId} connected but returned no profile URL`,
      );
      return;
    }
    await prisma.creatorSocialLink.upsert({
      where: {
        creatorId_platform: { creatorId: profile.id, platform },
      },
      create: { creatorId: profile.id, platform, url, verified: true },
      update: { url, verified: true },
    });
  } catch (err) {
    console.error(`[Auth] Failed to sync ${account.providerId} link:`, err);
  }
}
