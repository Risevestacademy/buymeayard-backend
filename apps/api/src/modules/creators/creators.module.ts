import { Module } from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { CreatorsController } from './creators.controller';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [StorageModule, LedgerModule],
  controllers: [CreatorsController],
  providers: [CreatorsService],
  exports: [CreatorsService],
})
export class CreatorsModule {}
