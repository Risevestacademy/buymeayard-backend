/**
 * Creator social links: a fixed platform list, and one canonical URL per link.
 * A creator can paste a handle (`@ada`) or any form of the profile URL; both
 * are stored as `https://<host>/<path>`.
 */
export const SOCIAL_PLATFORMS = [
  'youtube',
  'twitch',
  'x',
  'facebook',
  'instagram',
  'tiktok',
  'discord',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Names clients or older rows may still send. */
const ALIASES: Record<string, SocialPlatform> = { twitter: 'x' };

interface PlatformRule {
  /** Hosts a pasted URL may use (lowercase, `www.` and `m.` are stripped). */
  hosts: string[];
  /** Host written into the stored URL. */
  canonicalHost: string;
  /** Builds a URL from a bare handle, or null if the platform needs a link. */
  fromHandle: ((handle: string) => string) | null;
  handlePattern?: RegExp;
  /** A pasted URL's path must match this to count as a profile or invite. */
  pathPattern: RegExp;
}

const RULES: Record<SocialPlatform, PlatformRule> = {
  youtube: {
    hosts: ['youtube.com', 'youtu.be'],
    canonicalHost: 'youtube.com',
    fromHandle: (h) => `/@${h}`,
    handlePattern: /^[A-Za-z0-9._-]{3,30}$/,
    pathPattern: /^\/(@[\w.-]+|channel\/[\w-]+|c\/[\w.-]+|user\/[\w.-]+)$/,
  },
  twitch: {
    hosts: ['twitch.tv'],
    canonicalHost: 'twitch.tv',
    fromHandle: (h) => `/${h}`,
    handlePattern: /^[A-Za-z0-9_]{3,25}$/,
    pathPattern: /^\/[A-Za-z0-9_]{3,25}$/,
  },
  x: {
    hosts: ['x.com', 'twitter.com'],
    canonicalHost: 'x.com',
    fromHandle: (h) => `/${h}`,
    handlePattern: /^[A-Za-z0-9_]{1,15}$/,
    pathPattern: /^\/[A-Za-z0-9_]{1,15}$/,
  },
  facebook: {
    hosts: ['facebook.com', 'fb.com'],
    canonicalHost: 'facebook.com',
    fromHandle: (h) => `/${h}`,
    handlePattern: /^[A-Za-z0-9.]{5,50}$/,
    pathPattern: /^\/[A-Za-z0-9.]{5,50}$/,
  },
  instagram: {
    hosts: ['instagram.com', 'instagr.am'],
    canonicalHost: 'instagram.com',
    fromHandle: (h) => `/${h}`,
    handlePattern: /^[A-Za-z0-9._]{1,30}$/,
    pathPattern: /^\/[A-Za-z0-9._]{1,30}$/,
  },
  tiktok: {
    hosts: ['tiktok.com'],
    canonicalHost: 'tiktok.com',
    fromHandle: (h) => `/@${h}`,
    handlePattern: /^[A-Za-z0-9._]{2,24}$/,
    pathPattern: /^\/@[A-Za-z0-9._]{2,24}$/,
  },
  discord: {
    // Discord has no public profile URL, so only a server invite is accepted.
    hosts: ['discord.gg', 'discord.com', 'discordapp.com'],
    canonicalHost: 'discord.gg',
    fromHandle: null,
    pathPattern: /^\/(invite\/)?[A-Za-z0-9-]{2,32}$/,
  },
};

export class SocialLinkError extends Error {}

export function resolveSocialPlatform(input: string): SocialPlatform | null {
  const name = input.toLowerCase().trim();
  const platform = ALIASES[name] ?? name;
  return (SOCIAL_PLATFORMS as readonly string[]).includes(platform)
    ? platform
    : null;
}

/**
 * Validates a link for a platform and returns `{ platform, url }` with the
 * canonical URL. Throws SocialLinkError with a message fit to show the user.
 */
export function normalizeSocialLink(
  platformInput: string,
  valueInput: string,
): { platform: SocialPlatform; url: string } {
  const platform = resolveSocialPlatform(platformInput ?? '');
  if (!platform) {
    throw new SocialLinkError(
      `"${platformInput}" is not supported. Use one of: ${SOCIAL_PLATFORMS.join(', ')}`,
    );
  }
  const rule = RULES[platform];
  const value = (valueInput ?? '').trim();
  if (!value) throw new SocialLinkError(`Enter your ${platform} link`);

  const looksLikeUrl =
    /^(https?:\/\/|www\.)/i.test(value) || value.includes('/');
  if (!looksLikeUrl) {
    const handle = value.replace(/^@/, '');
    if (!rule.fromHandle || !rule.handlePattern?.test(handle)) {
      throw new SocialLinkError(
        rule.fromHandle
          ? `That is not a valid ${platform} handle`
          : `Paste a ${platform} invite link, for example https://discord.gg/yourserver`,
      );
    }
    return {
      platform,
      url: `https://${rule.canonicalHost}${rule.fromHandle(handle)}`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new SocialLinkError(`That is not a valid ${platform} link`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !rule.hosts.includes(host) ||
    !rule.pathPattern.test(path)
  ) {
    throw new SocialLinkError(
      `That is not a ${platform} ${platform === 'discord' ? 'invite' : 'profile'} link`,
    );
  }
  // Short youtu.be links point at videos, not channels.
  if (host === 'youtu.be') {
    throw new SocialLinkError(
      'Use your YouTube channel link, not a video link',
    );
  }
  const canonicalPath =
    platform === 'discord' ? `/${path.replace(/^\/(invite\/)?/, '')}` : path;
  return { platform, url: `https://${rule.canonicalHost}${canonicalPath}` };
}
