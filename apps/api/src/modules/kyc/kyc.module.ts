import { Module } from '@nestjs/common';
import { InfrastructureKycModule } from '../../infrastructure/kyc/infrastructure-kyc.module';
import { KycService } from './kyc.service';
import { KycAdminService } from './kyc-admin.service';
import { KycTransitionService } from './kyc-transition.service';
import { KycController } from './kyc.controller';
import { KycAdminController } from './kyc-admin.controller';
import { KycWebhookController } from './kyc-webhook.controller';

@Module({
  imports: [InfrastructureKycModule],
  controllers: [KycController, KycAdminController, KycWebhookController],
  providers: [KycService, KycAdminService, KycTransitionService],
  exports: [KycService],
})
export class KycModule {}
