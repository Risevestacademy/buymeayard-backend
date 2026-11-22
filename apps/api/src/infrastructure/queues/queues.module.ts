import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        );
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password
              ? decodeURIComponent(url.password)
              : undefined,
            db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
            ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
