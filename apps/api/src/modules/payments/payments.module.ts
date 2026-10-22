import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { InfrastructurePaymentsModule } from '../../infrastructure/payments/infrastructure-payments.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [InfrastructurePaymentsModule, LedgerModule, PayoutsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
