import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { Expo } from 'expo-server-sdk';
import { PushTokensController } from './push-tokens.controller';
import { PushTokensService } from './push-tokens.service';
import { PushService } from './push.service';
import { PushProcessor } from './push.processor';
import { EXPO_CLIENT, PUSH_QUEUE } from './push.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: PUSH_QUEUE }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [PushTokensController],
  providers: [
    PushTokensService,
    PushService,
    PushProcessor,
    {
      provide: EXPO_CLIENT,
      // EXPO_ACCESS_TOKEN is only needed when Enhanced Push Security is on.
      useFactory: () =>
        new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined }),
    },
  ],
  exports: [PushService],
})
export class PushNotificationsModule {}
