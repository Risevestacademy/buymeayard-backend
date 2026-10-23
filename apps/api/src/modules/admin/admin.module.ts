import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AuditLogInterceptor } from './interceptors/audit-log.interceptor';
import { AnalyticsModule } from '../analytics/analytics.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PaymentsModule } from '../payments/payments.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { AdminDashboardService } from './dashboard/admin-dashboard.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminCreatorsController } from './creators/admin-creators.controller';
import { AdminCreatorsService } from './creators/admin-creators.service';
import { AdminSupportsController } from './supports/admin-supports.controller';
import { AdminSupportsService } from './supports/admin-supports.service';
import { AdminPayoutsController } from './payouts/admin-payouts.controller';
import { AdminPayoutsService } from './payouts/admin-payouts.service';
import { AdminLedgerController } from './ledger/admin-ledger.controller';
import { AdminLedgerService } from './ledger/admin-ledger.service';
import { AdminReportsController } from './moderation/admin-reports.controller';
import { AdminReportsService } from './moderation/admin-reports.service';
import { AdminTicketsController } from './tickets/admin-tickets.controller';
import { AdminTicketsService } from './tickets/admin-tickets.service';
import { AdminSettingsController } from './settings/admin-settings.controller';
import { AdminSettingsService } from './settings/admin-settings.service';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AdminAuditService } from './audit/admin-audit.service';

@Module({
  imports: [
    AnalyticsModule,
    LedgerModule,
    PayoutsModule,
    PaymentsModule,
    WaitlistModule,
  ],
  controllers: [
    AdminController,
    AdminUsersController,
    AdminCreatorsController,
    AdminSupportsController,
    AdminPayoutsController,
    AdminLedgerController,
    AdminReportsController,
    AdminTicketsController,
    AdminSettingsController,
    AdminAuditController,
  ],
  providers: [
    AuditLogInterceptor,
    AdminDashboardService,
    AdminUsersService,
    AdminCreatorsService,
    AdminSupportsService,
    AdminPayoutsService,
    AdminLedgerService,
    AdminReportsService,
    AdminTicketsService,
    AdminSettingsService,
    AdminAuditService,
  ],
  exports: [AuditLogInterceptor],
})
export class AdminModule {}
