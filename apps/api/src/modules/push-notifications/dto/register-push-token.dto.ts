import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export const PUSH_PLATFORMS = ['ios', 'android'] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export class RegisterPushTokenDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Expo push token of this device',
  })
  @IsString()
  token!: string;

  @ApiProperty({ enum: PUSH_PLATFORMS, example: 'android' })
  @IsIn(PUSH_PLATFORMS, { message: 'platform must be ios or android' })
  platform!: PushPlatform;
}
