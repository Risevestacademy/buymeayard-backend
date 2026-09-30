import { ApiProperty } from '@nestjs/swagger';

export class SocialShareLinksDto {
  @ApiProperty({
    example:
      'https://twitter.com/intent/tweet?text=Support%20my%20creative%20work%20on%20Buy%20Me%20a%20Yard!%20Send%20me%20a%20yard%20of%20Ankara%20at%20https%3A%2F%2Fbuymeayard.com%2Ffisayo',
    description: 'One-click Twitter/X intent share URL',
  })
  twitter: string;

  @ApiProperty({
    example:
      'https://api.whatsapp.com/send?text=Support%20my%20creative%20work%20on%20Buy%20Me%20a%20Yard!%20https%3A%2F%2Fbuymeayard.com%2Ffisayo',
    description: 'One-click WhatsApp direct share link',
  })
  whatsapp: string;

  @ApiProperty({
    example:
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fbuymeayard.com%2Ffisayo',
    description: 'One-click Facebook share dialogue URL',
  })
  facebook: string;

  @ApiProperty({
    example:
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fbuymeayard.com%2Ffisayo',
    description: 'One-click LinkedIn post share URL',
  })
  linkedin: string;

  @ApiProperty({
    example:
      'https://t.me/share/url?url=https%3A%2F%2Fbuymeayard.com%2Ffisayo&text=Support%20my%20creative%20work%20on%20Buy%20Me%20a%20Yard!',
    description: 'One-click Telegram share link',
  })
  telegram: string;
}

export class CreatorShareLinkDataDto {
  @ApiProperty({
    example: 'https://buymeayard.com/fisayo',
    description: 'Canonical public URL for the creator public page',
  })
  publicUrl: string;

  @ApiProperty({
    example: 'fisayo',
    description: 'Creator slug handle',
  })
  slug: string;

  @ApiProperty({
    example:
      'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fbuymeayard.com%2Ffisayo',
    description:
      'Direct URL to a scannable QR code image for in-person and cross-device gifting',
  })
  qrCodeUrl: string;

  @ApiProperty({
    example:
      'Support my creative work on Buy Me a Yard! Send me a yard of Ankara, Aso-oke, or Lace: https://buymeayard.com/fisayo',
    description:
      'Pre-composed promotional sharing text for social media and messaging channels',
  })
  shareText: string;

  @ApiProperty({
    type: SocialShareLinksDto,
    description: 'Direct one-click sharing URLs for social platforms',
  })
  socialLinks: SocialShareLinksDto;
}

export class CreatorShareLinkResponseDto {
  @ApiProperty({
    type: CreatorShareLinkDataDto,
    description: 'Creator share link data',
  })
  data: CreatorShareLinkDataDto;
}
