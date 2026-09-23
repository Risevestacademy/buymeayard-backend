import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuditLogService } from './audit-log.service';
import { UserAuditListener} from './listeners/user-audit.listeners';
import { PostHogService } from './posthog.service';
import { PostHogAnalyticsListener } from './listeners/posthog-analytics.listener';

@Module({
  providers: [AnalyticsService,
    AuditLogService,
    UserAuditListener,
    PostHogService,
    PostHogAnalyticsListener,
  ],
  exports: [AnalyticsService,
    AuditLogService,
    PostHogService,
  ],
})
export class AnalyticsModule {}
