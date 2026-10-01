import { Module } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { InfrastructurePaymentsModule } from '../../infrastructure/payments/infrastructure-payments.module';

@Module({
  imports: [LedgerModule, InfrastructurePaymentsModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
