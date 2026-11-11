import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Provider ids accepted by POST /auth/link-social. `twitter` is X. */
export const LINKABLE_SOCIAL_PROVIDERS = [
  'youtube',
  'twitch',
  'twitter',
  'facebook',
  'instagram',
  'tiktok',
  'discord',
] as const;

/**
 * Documentation shape for POST /auth/link-social. The request is handled by
 * Better Auth, which validates the body itself.
 */
export class LinkSocialDto {
  @ApiProperty({
    enum: LINKABLE_SOCIAL_PROVIDERS,
    example: 'youtube',
    description:
      'Platform to connect. `twitter` connects the creator X account (stored as platform `x`).',
  })
  provider!: string;

  @ApiProperty({
    example:
      'https://creator.buymeayard.com/settings/socials?connected=youtube',
    description:
      'Where the browser lands after a successful connection. Must be a trusted origin. On mobile use a deep link such as buymeayard://socials.',
  })
  callbackURL!: string;

  @ApiPropertyOptional({
    example: 'https://creator.buymeayard.com/settings/socials?failed=youtube',
    description:
      'Where the browser lands if the connection fails or is cancelled. The URL gets `?error=<code>` appended (for example `access_denied` or `unable_to_get_user_info`). Always send it.',
  })
  errorCallbackURL?: string;
}
