// apps/api/src/modules/analytics/posthog.service.ts

import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

@Injectable()
export class PostHogService implements OnModuleDestroy {
  private readonly logger = new Logger(PostHogService.name);
  private readonly client: PostHog;

  constructor(private readonly configService: ConfigService) {
    this.client = new PostHog(
      this.configService.get<string>('POSTHOG_API_KEY')!,
      {
        host: this.configService.get<string>('POSTHOG_HOST') ?? 'https://us.i.posthog.com',
      },
    );
  }

  capture(params: { distinctId: string; event: string; properties?: Record<string, unknown> }): void {
    try {
      this.client.capture(params);
    } catch (error) {
      // Analytics failures should never break the app, same principle as AuditLogService
      this.logger.error(`Failed to capture PostHog event "${params.event}"`, error instanceof Error ? error.stack : String(error));
    }
  }


captureException(error: Error, distinctId: string, properties?: Record<string, unknown>): void {
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
    await this.client.shutdown();
  }
}