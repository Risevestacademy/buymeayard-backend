import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreatorReportsController } from './creator-reports.controller';
import { CreatorReportsService } from './creator-reports.service';

@Module({
  imports: [
    NotificationsModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [CreatorReportsController],
  providers: [CreatorReportsService],
})
export class CreatorReportsModule {}
