// apps/api/src/modules/analytics/listeners/posthog-analytics.listener.ts

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PostHogService } from '../posthog.service';
import { USER_EVENTS, UserCreatedEvent, UserLoginEvent } from '../events/user.events';

@Injectable()
export class PostHogAnalyticsListener {
  constructor(private readonly postHogService: PostHogService) {}

  @OnEvent(USER_EVENTS.CREATED)
  handleUserCreated(payload: UserCreatedEvent): void {
    this.postHogService.capture({
      distinctId: payload.userId,
      event: 'user_signed_up', // PostHog convention favors snake_case event names
      properties: { email: payload.email, name: payload.name },
    });
  }

  @OnEvent(USER_EVENTS.LOGIN)
  handleUserLogin(payload: UserLoginEvent): void {
    this.postHogService.capture({
      distinctId: payload.userId,
      event: 'user_logged_in',
      properties: { ip_address: payload.ipAddress },
    });
  }
}