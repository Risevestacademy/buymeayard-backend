import {
  normalizeSocialLink,
  resolveSocialPlatform,
  SocialLinkError,
} from './social-links.util';

describe('resolveSocialPlatform', () => {
  it('accepts the supported platforms and maps twitter to x', () => {
    for (const p of [
      'youtube',
      'twitch',
      'x',
      'facebook',
      'instagram',
      'tiktok',
      'discord',
    ]) {
      expect(resolveSocialPlatform(p)).toBe(p);
    }
    expect(resolveSocialPlatform(' Twitter ')).toBe('x');
    expect(resolveSocialPlatform('linkedin')).toBeNull();
  });
});

describe('normalizeSocialLink', () => {
  it.each([
    ['instagram', '@ada', 'https://instagram.com/ada'],
    ['instagram', 'ada.lace', 'https://instagram.com/ada.lace'],
    ['x', '@ada_o', 'https://x.com/ada_o'],
    ['tiktok', 'ada', 'https://tiktok.com/@ada'],
    ['youtube', '@adatv', 'https://youtube.com/@adatv'],
    ['twitch', 'adastream', 'https://twitch.tv/adastream'],
    ['facebook', 'ada.designs', 'https://facebook.com/ada.designs'],
  ])('builds %s handle %s', (platform, input, url) => {
    expect(normalizeSocialLink(platform, input)).toEqual({
      platform: platform,
      url,
    });
  });

  it.each([
    [
      'instagram',
      'http://www.instagram.com/ada/?hl=en#top',
      'https://instagram.com/ada',
    ],
    ['x', 'https://twitter.com/ada/', 'https://x.com/ada'],
    ['x', 'x.com/ada', 'https://x.com/ada'],
    [
      'tiktok',
      'https://www.tiktok.com/@ada?lang=en',
      'https://tiktok.com/@ada',
    ],
    [
      'youtube',
      'https://m.youtube.com/channel/UCabc_123',
      'https://youtube.com/channel/UCabc_123',
    ],
    [
      'twitch',
      'https://www.twitch.tv/adastream',
      'https://twitch.tv/adastream',
    ],
    [
      'facebook',
      'https://fb.com/ada.designs',
      'https://facebook.com/ada.designs',
    ],
  ])('canonicalises %s url %s', (platform, input, url) => {
    expect(normalizeSocialLink(platform, input).url).toBe(url);
  });

  it('maps the twitter alias to x', () => {
    expect(normalizeSocialLink('twitter', '@ada')).toEqual({
      platform: 'x',
      url: 'https://x.com/ada',
    });
  });

  it('takes only invite links for discord', () => {
    expect(
      normalizeSocialLink('discord', 'https://discord.com/invite/ankara-club'),
    ).toEqual({ platform: 'discord', url: 'https://discord.gg/ankara-club' });
    expect(normalizeSocialLink('discord', 'discord.gg/ankara').url).toBe(
      'https://discord.gg/ankara',
    );
    expect(() => normalizeSocialLink('discord', 'ada#1234')).toThrow(
      SocialLinkError,
    );
    expect(() => normalizeSocialLink('discord', 'ada')).toThrow(/invite link/);
  });

  it.each([
    ['linkedin', '@ada'],
    ['instagram', ''],
    ['instagram', 'not a handle!'],
    ['instagram', 'https://x.com/ada'],
    ['instagram', 'https://instagram.com.evil.com/ada'],
    ['instagram', 'javascript:alert(1)'],
    ['x', '@waytoolongforahandle'],
    ['tiktok', 'https://tiktok.com/ada'],
    ['youtube', 'https://youtu.be/dQw4w9WgXcQ'],
    ['youtube', 'https://youtube.com/watch'],
  ])('rejects %s "%s"', (platform, input) => {
    expect(() => normalizeSocialLink(platform, input)).toThrow(SocialLinkError);
  });
});
