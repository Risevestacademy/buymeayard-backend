import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialSignInDto {
  @ApiProperty({
    description: 'OAuth provider name',
    example: 'google',
    enum: ['google', 'apple', 'twitter', 'facebook', 'instagram', 'tiktok'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['google', 'apple', 'twitter', 'facebook', 'instagram', 'tiktok'], {
    message:
      'Invalid provider. Supported providers: google, apple, twitter, facebook, instagram, tiktok',
  })
  provider!: string;

  @ApiPropertyOptional({
    description:
      'Where to redirect after successful OAuth authentication. Supports custom mobile schemes (e.g. buymeayard://oauth-callback) or web URLs.',
    example: 'buymeayard://oauth-callback',
  })
  @IsOptional()
  @IsString()
  callbackURL?: string;

  @ApiPropertyOptional({
    description: 'Where to redirect on authentication error',
    example: 'buymeayard://oauth-callback?error=true',
  })
  @IsOptional()
  @IsString()
  errorCallbackURL?: string;

  @ApiPropertyOptional({
    description: 'Where to redirect new users after initial registration',
    example: 'buymeayard://onboarding',
  })
  @IsOptional()
  @IsString()
  newUserCallbackURL?: string;
}

export class SocialSignInResponseDto {
  @ApiProperty({
    description:
      'The OAuth authorization URL to open in a browser, webview, or auth session',
    example:
      'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=...',
  })
  url!: string;

  @ApiProperty({
    description: 'Whether the client should redirect to this URL',
    example: true,
  })
  redirect!: boolean;
}
