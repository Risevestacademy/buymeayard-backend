import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import {
  StorageProvider,
  UploadFileOptions,
  UploadFileResult,
} from './storage-provider.interface';

@Injectable()
export class CloudinaryStorageProvider implements StorageProvider {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log(
        `Cloudinary storage provider initialized (cloud: ${cloudName})`,
      );
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'Cloudinary credentials not fully configured; falling back to placeholder storage for local development.',
      );
    }
  }

  async uploadFile(
    fileBuffer: Buffer,
    options?: UploadFileOptions,
  ): Promise<UploadFileResult> {
    if (!this.isConfigured) {
      this.logger.warn(
        'Uploading via fallback storage mock because Cloudinary is unconfigured',
      );
      const publicId = options?.publicId || `file_${Date.now()}`;
      return {
        storageKey: publicId,
        url: `https://res.cloudinary.com/buymeayard/image/upload/${options?.folder || 'avatars'}/${publicId}.jpg`,
        secureUrl: `https://res.cloudinary.com/buymeayard/image/upload/${options?.folder || 'avatars'}/${publicId}.jpg`,
        bytes: fileBuffer.length,
        format: 'jpg',
      };
    }

    return new Promise<UploadFileResult>((resolve, reject) => {
      const uploadOptions: UploadApiOptions = {
        folder: options?.folder || 'buymeayard',
        resource_type: options?.resourceType || 'auto',
        overwrite: true,
      };

      if (options?.publicId) {
        uploadOptions.public_id = options.publicId;
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error || !result) {
            this.logger.error('Failed to upload file to Cloudinary', error);
            const rejectionErr =
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string'
                      ? error
                      : 'Cloudinary upload returned empty response',
                  );
            return reject(rejectionErr);
          }

          resolve({
            storageKey: result.public_id,
            url: result.url,
            secureUrl: result.secure_url,
            format: result.format,
            bytes: result.bytes,
          });
        },
      );

      uploadStream.end(fileBuffer);
    });
  }

  async deleteFile(storageKey: string): Promise<boolean> {
    if (!this.isConfigured) {
      return true;
    }

    try {
      const result = await cloudinary.uploader.destroy(storageKey);
      return result.result === 'ok';
    } catch (error) {
      this.logger.error(
        `Failed to delete file from Cloudinary: ${storageKey}`,
        error,
      );
      return false;
    }
  }

  async getSignedUrl(
    storageKey: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    if (!this.isConfigured) {
      return `https://res.cloudinary.com/buymeayard/image/upload/${storageKey}.jpg`;
    }

    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.utils.url(storageKey, {
      secure: true,
      sign_url: true,
      expires_at: expiresAt,
    });
  }
}
