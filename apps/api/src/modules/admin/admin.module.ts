import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [AdminController],
  providers: [AdminService, AuditLogInterceptor],
  exports: [AdminService, AuditLogInterceptor],
})
export class AdminModule {}
