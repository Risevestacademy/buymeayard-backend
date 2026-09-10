export interface UploadFileOptions {
  folder?: string;
  publicId?: string;
  resourceType?: 'image' | 'video' | 'raw' | 'auto';
}

export interface UploadFileResult {
  storageKey: string;
  url: string;
  secureUrl: string;
  format?: string;
  bytes: number;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  uploadFile(
    fileBuffer: Buffer,
    options?: UploadFileOptions,
  ): Promise<UploadFileResult>;
  deleteFile(storageKey: string): Promise<boolean>;
  getSignedUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}
