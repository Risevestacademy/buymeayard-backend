import { fetchProfileUrl, syncSocialLink } from './social-link-sync';

const reply = (body: unknown, ok = true) =>
  jest.fn().mockResolvedValue({ ok, json: async () => body });

const account = (providerId: string) => ({
  userId: 'u1',
  providerId,
  accountId: 'a1',
  accessToken: 'tok',
});

describe('fetchProfileUrl', () => {
  const cases: [string, unknown, string][] = [
    ['twitter', { data: { username: 'ada' } }, 'https://x.com/ada'],
    ['instagram', { username: 'ada' }, 'https://instagram.com/ada'],
    [
      'tiktok',
      { data: { user: { username: 'ada' } } },
      'https://tiktok.com/@ada',
    ],
    ['twitch', { data: [{ login: 'ada' }] }, 'https://twitch.tv/ada'],
    ['discord', { id: '99' }, 'https://discord.com/users/99'],
    [
      'facebook',
      { link: 'https://facebook.com/ada.o' },
      'https://facebook.com/ada.o',
    ],
    [
      'youtube',
      { items: [{ id: 'UC1', snippet: { customUrl: '@ada' } }] },
      'https://youtube.com/@ada',
    ],
    [
      'youtube',
      { items: [{ id: 'UC1', snippet: {} }] },
      'https://youtube.com/channel/UC1',
    ],
  ];

  it.each(cases)('%s -> profile url', async (provider, body, expected) => {
    const f = reply(body) as unknown as typeof fetch;
    await expect(fetchProfileUrl(account(provider), f)).resolves.toBe(expected);
  });

  it('returns null without a token, on API errors and for unknown providers', async () => {
    await expect(
      fetchProfileUrl({ ...account('twitter'), accessToken: null }),
    ).resolves.toBeNull();
    await expect(
      fetchProfileUrl(account('twitter'), reply({}, false) as any),
    ).resolves.toBeNull();
    await expect(fetchProfileUrl(account('google'))).resolves.toBeNull();
    await expect(
      fetchProfileUrl(account('facebook'), reply({ id: '1' }) as any),
    ).resolves.toBeNull();
  });
});

describe('syncSocialLink', () => {
  const prisma = {
    creatorProfile: { findUnique: jest.fn() },
    creatorSocialLink: { upsert: jest.fn() },
  } as any;
  beforeEach(() => jest.clearAllMocks());

  it('stores a verified link for creators', async () => {
    prisma.creatorProfile.findUnique.mockResolvedValue({ id: 'c1' });
    await syncSocialLink(
      prisma,
      account('twitter'),
      reply({ data: { username: 'ada' } }) as any,
    );
    expect(prisma.creatorSocialLink.upsert).toHaveBeenCalledWith({
      where: { creatorId_platform: { creatorId: 'c1', platform: 'x' } },
      create: {
        creatorId: 'c1',
        platform: 'x',
        url: 'https://x.com/ada',
        verified: true,
      },
      update: { url: 'https://x.com/ada', verified: true },
    });
  });

  it('skips non-social providers, non-creators and failures', async () => {
    await syncSocialLink(prisma, account('google'));
    prisma.creatorProfile.findUnique.mockResolvedValue(null);
    await syncSocialLink(prisma, account('twitter'));
    prisma.creatorProfile.findUnique.mockRejectedValue(new Error('db'));
    await expect(
      syncSocialLink(prisma, account('twitter')),
    ).resolves.toBeUndefined();
    expect(prisma.creatorSocialLink.upsert).not.toHaveBeenCalled();
  });
});
