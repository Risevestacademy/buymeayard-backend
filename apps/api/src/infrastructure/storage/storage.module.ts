import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage-provider.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useValue: {
        uploadFile: async () => ({
          storageKey: 'mock_key',
          url: 'http://localhost/mock.jpg',
          secureUrl: 'https://localhost/mock.jpg',
          bytes: 1024,
        }),
        deleteFile: async () => true,
        getSignedUrl: async () => 'https://localhost/mock_signed_url',
      },
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
