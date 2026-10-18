import { Module } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { PayoutMethodsService } from './payout-methods.service';
import { PayoutsReconciler } from './payouts.reconciler';
import { LedgerModule } from '../ledger/ledger.module';
import { InfrastructurePaymentsModule } from '../../infrastructure/payments/infrastructure-payments.module';

@Module({
  imports: [LedgerModule, InfrastructurePaymentsModule],
  controllers: [PayoutsController],
  providers: [PayoutsService, PayoutMethodsService, PayoutsReconciler],
  exports: [PayoutsService, PayoutMethodsService],
})
export class PayoutsModule {}
