import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';

// Infrastructure
import { DatabaseModule } from './infrastructure/database/database.module';
import { InfrastructurePaymentsModule } from './infrastructure/payments/infrastructure-payments.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { InfrastructureNotificationsModule } from './infrastructure/notifications/infrastructure-notifications.module';
import { QueuesModule } from './infrastructure/queues/queues.module';

// Domain Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CreatorsModule } from './modules/creators/creators.module';
import { SupportersModule } from './modules/supporters/supporters.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { SupportsModule } from './modules/supports/supports.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { ContentModule } from './modules/content/content.module';
import { FollowsModule } from './modules/follows/follows.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { KycModule } from './modules/kyc/kyc.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

// Common
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuthGuard } from './common/guards/auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    InfrastructurePaymentsModule,
    StorageModule,
    InfrastructureNotificationsModule,
    QueuesModule,

    // Domains
    AuthModule,
    UsersModule,
    CreatorsModule,
    SupportersModule,
    MaterialsModule,
    SupportsModule,
    PaymentsModule,
    LedgerModule,
    PayoutsModule,
    ContentModule,
    FollowsModule,
    NotificationsModule,
    KycModule,
    ModerationModule,
    AdminModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
