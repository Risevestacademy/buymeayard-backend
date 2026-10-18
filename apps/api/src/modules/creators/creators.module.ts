import { Module } from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { CreatorsController } from './creators.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { SupportsModule } from '../supports/supports.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [StorageModule, SupportsModule,LedgerModule],
  controllers: [CreatorsController],
  providers: [CreatorsService],
  exports: [CreatorsService],
})
export class CreatorsModule {}
