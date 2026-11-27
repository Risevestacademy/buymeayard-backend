import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { InfrastructurePaymentsModule } from '../../infrastructure/payments/infrastructure-payments.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { RefundsService } from './refunds.service';

@Module({
  imports: [InfrastructurePaymentsModule, LedgerModule, PayoutsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, RefundsService],
  exports: [PaymentsService, RefundsService],
})
export class PaymentsModule {}
