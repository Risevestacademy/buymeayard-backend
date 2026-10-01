import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PostHogService } from './posthog.service';
import { PostHog } from 'posthog-node';

jest.mock('posthog-node');

describe('PostHogService', () => {
  let service: PostHogService;
  let configService: { get: jest.Mock };
  let mockPostHogInstance: {
    capture: jest.Mock;
    captureException: jest.Mock;
    shutdown: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPostHogInstance = {
      capture: jest.fn(),
      captureException: jest.fn(),
      shutdown: jest.fn().mockResolvedValue(undefined),
    };
    (PostHog as unknown as jest.Mock).mockImplementation(
      () => mockPostHogInstance,
    );
  });

  describe('when POSTHOG_API_KEY is not configured', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PostHogService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      service = module.get<PostHogService>(PostHogService);
    });

    it('should be defined and not instantiate PostHog', () => {
      expect(service).toBeDefined();
      expect(PostHog).not.toHaveBeenCalled();
    });

    it('should gracefully no-op capture without crashing', () => {
      expect(() => {
        service.capture({
          distinctId: 'user-1',
          event: 'test_event',
          properties: { foo: 'bar' },
        });
      }).not.toThrow();
      expect(mockPostHogInstance.capture).not.toHaveBeenCalled();
    });

    it('should gracefully no-op captureException without crashing', () => {
      expect(() => {
        service.captureException(new Error('Boom'), 'user-1');
      }).not.toThrow();
      expect(mockPostHogInstance.captureException).not.toHaveBeenCalled();
    });

    it('should gracefully no-op onModuleDestroy', async () => {
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('when POSTHOG_API_KEY is configured', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'POSTHOG_API_KEY') return 'phc_valid_test_key';
          if (key === 'POSTHOG_HOST') return 'https://custom.posthog.com';
          return undefined;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PostHogService,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      service = module.get<PostHogService>(PostHogService);
    });

    it('should instantiate PostHog with provided key and host', () => {
      expect(PostHog).toHaveBeenCalledWith('phc_valid_test_key', {
        host: 'https://custom.posthog.com',
      });
    });

    it('should forward capture calls to PostHog client', () => {
      service.capture({
        distinctId: 'user-123',
        event: 'user_signed_up',
        properties: { email: 'test@example.com' },
      });

      expect(mockPostHogInstance.capture).toHaveBeenCalledWith({
        distinctId: 'user-123',
        event: 'user_signed_up',
        properties: { email: 'test@example.com' },
      });
    });

    it('should forward captureException calls to PostHog client', () => {
      const err = new Error('Database down');
      service.captureException(err, 'user-123', { status: 500 });

      expect(mockPostHogInstance.captureException).toHaveBeenCalledWith(
        err,
        'user-123',
        { status: 500 },
      );
    });

    it('should shutdown PostHog client onModuleDestroy', async () => {
      await service.onModuleDestroy();
      expect(mockPostHogInstance.shutdown).toHaveBeenCalled();
    });
  });
});
