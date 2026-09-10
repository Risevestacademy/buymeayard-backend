import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { PaystackProvider } from './paystack.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useClass: PaystackProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class InfrastructurePaymentsModule {}
