import { IsIn, IsOptional, IsString, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SocialSignInDto {
  @ApiProperty({
    example: 'google',
    enum: ['google', 'apple', 'twitter', 'facebook'],
    description: 'OAuth social provider',
  })
  @IsIn(['google', 'apple', 'twitter', 'facebook'])
  provider!: 'google' | 'apple' | 'twitter' | 'facebook';

  @ApiPropertyOptional({
    example: 'https://buymeayard-creator-dev.up.railway.app/auth/callback',
    description:
      'Callback URL after successful OAuth authorization (for web flows)',
  })
  @IsOptional()
  @IsString()
  callbackURL?: string;

  @ApiPropertyOptional({
    example: 'https://buymeayard-creator-dev.up.railway.app/auth/error',
    description: 'Callback URL if OAuth fails',
  })
  @IsOptional()
  @IsString()
  errorCallbackURL?: string;

  @ApiPropertyOptional({
    example: 'https://buymeayard-creator-dev.up.railway.app/onboarding',
    description: 'Callback URL specifically for newly registered users',
  })
  @IsOptional()
  @IsString()
  newUserCallbackURL?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Set to true to return the OAuth URL in the response JSON instead of automatically redirecting',
  })
  @IsOptional()
  @IsBoolean()
  disableRedirect?: boolean;

  @ApiPropertyOptional({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
    description:
      'Identity token from native mobile SDKs (Google Sign-In on Android/iOS or Sign in with Apple)',
  })
  @IsOptional()
  @IsString()
  idToken?: string;
}

export class GoogleSignInDto {
  @ApiPropertyOptional({
    example: 'https://buymeayard-creator-dev.up.railway.app/auth/callback',
    description:
      'Callback URL after successful Google OAuth authorization (for web flows)',
  })
  @IsOptional()
  @IsString()
  callbackURL?: string;

  @ApiPropertyOptional({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
    description:
      'Google ID token from native mobile Google Sign-In SDK (Android/iOS)',
  })
  @IsOptional()
  @IsString()
  idToken?: string;
}

export class AppleSignInDto {
  @ApiPropertyOptional({
    example: 'https://buymeayard-creator-dev.up.railway.app/auth/callback',
    description:
      'Callback URL after successful Apple OAuth authorization (for web flows)',
  })
  @IsOptional()
  @IsString()
  callbackURL?: string;

  @ApiPropertyOptional({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
    description: 'Apple Identity token from native iOS Sign in with Apple SDK',
  })
  @IsOptional()
  @IsString()
  idToken?: string;
}
