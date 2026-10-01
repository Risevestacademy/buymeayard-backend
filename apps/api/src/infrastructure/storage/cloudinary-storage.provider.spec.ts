import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CloudinaryStorageProvider } from './cloudinary-storage.provider';
import { v2 as cloudinary } from 'cloudinary';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
      destroy: jest.fn(),
    },
    utils: {
      url: jest.fn(),
    },
  },
}));

describe('CloudinaryStorageProvider', () => {
  let provider: CloudinaryStorageProvider;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('when credentials are fully configured', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'CLOUDINARY_CLOUD_NAME') return 'test_cloud';
          if (key === 'CLOUDINARY_API_KEY') return 'test_key';
          if (key === 'CLOUDINARY_API_SECRET') return 'test_secret';
          return null;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CloudinaryStorageProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      provider = module.get<CloudinaryStorageProvider>(
        CloudinaryStorageProvider,
      );
    });

    it('should configure cloudinary with config values', () => {
      expect(cloudinary.config).toHaveBeenCalledWith({
        cloud_name: 'test_cloud',
        api_key: 'test_key',
        api_secret: 'test_secret',
        secure: true,
      });
    });

    it('should upload a file buffer via upload_stream', async () => {
      const mockResult = {
        public_id: 'avatars/creator-123',
        url: 'http://res.cloudinary.com/test_cloud/image/upload/avatars/creator-123.jpg',
        secure_url:
          'https://res.cloudinary.com/test_cloud/image/upload/avatars/creator-123.jpg',
        bytes: 2048,
        format: 'jpg',
      };

      (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
        (options, callback) => {
          return {
            end: jest.fn((_buffer) => {
              callback(null, mockResult);
            }),
          };
        },
      );

      const buffer = Buffer.from('test-image-data');
      const result = await provider.uploadFile(buffer, {
        folder: 'avatars',
        publicId: 'creator-123',
        resourceType: 'image',
      });

      expect(result.storageKey).toBe('avatars/creator-123');
      expect(result.secureUrl).toBe(mockResult.secure_url);
      expect(result.bytes).toBe(2048);
    });

    it('should handle deletion of a file', async () => {
      (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({
        result: 'ok',
      });

      const res = await provider.deleteFile('avatars/creator-123');
      expect(res).toBe(true);
      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
        'avatars/creator-123',
      );
    });

    it('should generate signed url', async () => {
      (cloudinary.utils.url as jest.Mock).mockReturnValue(
        'https://res.cloudinary.com/test_cloud/signed.jpg',
      );

      const url = await provider.getSignedUrl('avatars/creator-123', 1800);
      expect(url).toBe('https://res.cloudinary.com/test_cloud/signed.jpg');
    });
  });

  describe('when credentials are not configured', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn().mockReturnValue(null),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CloudinaryStorageProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      provider = module.get<CloudinaryStorageProvider>(
        CloudinaryStorageProvider,
      );
    });

    it('should fall back gracefully to Cloudinary placeholder url instead of crashing', async () => {
      const buffer = Buffer.from('test-image');
      const result = await provider.uploadFile(buffer, {
        folder: 'avatars',
        publicId: 'test-user',
      });

      expect(result.secureUrl).toContain(
        'https://res.cloudinary.com/buymeayard/image/upload/avatars/test-user.jpg',
      );
    });
  });
});
