import { Module } from '@nestjs/common';
import { SupportsService } from './supports.service';

@Module({
  providers: [SupportsService],
  exports: [SupportsService],
})
export class SupportsModule {}
