import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KYC_PROVIDER } from './kyc-provider.interface';
import { DiditProvider } from './didit/didit.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: KYC_PROVIDER,
      useClass: DiditProvider,
    },
  ],
  exports: [KYC_PROVIDER],
})
export class InfrastructureKycModule {}
