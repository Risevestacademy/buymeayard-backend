import { Module } from '@nestjs/common';
import { SupportsService } from './supports.service';
import { SupportAlertsService } from './support-alerts.service';

@Module({
  providers: [SupportsService, SupportAlertsService],
  exports: [SupportsService, SupportAlertsService],
})
export class SupportsModule {}
