import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { BachsProvider } from './bachs.provider';
// Paystack is switched off for now. The provider and its tests are kept, so
// going back means swapping the two lines marked below.
// import { PaystackProvider } from './paystack.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      useClass: BachsProvider,
      // useClass: PaystackProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class InfrastructurePaymentsModule {}
