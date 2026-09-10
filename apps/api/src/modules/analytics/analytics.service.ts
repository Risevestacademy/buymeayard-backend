import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async trackEvent(eventName: string, properties?: Record<string, any>) {
    this.logger.log(
      `[Event Tracked] ${eventName}: ${JSON.stringify(properties || {})}`,
    );
  }
}
