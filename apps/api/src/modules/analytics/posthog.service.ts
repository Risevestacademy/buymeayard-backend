// apps/api/src/modules/analytics/posthog.service.ts

import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

@Injectable()
export class PostHogService implements OnModuleDestroy {
  private readonly logger = new Logger(PostHogService.name);
  private readonly client: PostHog | null = null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('POSTHOG_API_KEY');
    if (apiKey && apiKey.trim()) {
      this.client = new PostHog(apiKey, {
        host:
          this.configService.get<string>('POSTHOG_HOST') ??
          'https://us.i.posthog.com',
      });
      this.logger.log('PostHog analytics initialized');
    } else {
      this.logger.warn(
        'POSTHOG_API_KEY not configured. PostHog analytics is disabled.',
      );
    }
  }

  capture(params: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
  }): void {
    if (!this.client) return;

    try {
      this.client.capture(params);
    } catch (error) {
      // Analytics failures should never break the app, same principle as AuditLogService
      this.logger.error(
        `Failed to capture PostHog event "${params.event}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  captureException(
    error: Error,
    distinctId: string,
    properties?: Record<string, unknown>,
  ): void {
    if (!this.client) return;

    try {
      this.client.captureException(error, distinctId, properties);
    } catch (err) {
      this.logger.error(
        `Failed to capture exception to PostHog`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
    }
  }
}
