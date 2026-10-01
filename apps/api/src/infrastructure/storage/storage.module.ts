import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: CloudinaryStorageProvider,
    },
    CloudinaryStorageProvider,
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
