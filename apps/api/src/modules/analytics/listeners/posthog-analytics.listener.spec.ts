import { Test, TestingModule } from '@nestjs/testing';
import { PostHogAnalyticsListener } from './posthog-analytics.listener';
import { PostHogService } from '../posthog.service';
import { UserCreatedEvent, UserLoginEvent } from '../events/user.events';

describe('PostHogAnalyticsListener', () => {
  let listener: PostHogAnalyticsListener;
  let postHogService: { capture: jest.Mock };

  beforeEach(async () => {
    postHogService = {
      capture: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostHogAnalyticsListener,
        { provide: PostHogService, useValue: postHogService },
      ],
    }).compile();

    listener = module.get<PostHogAnalyticsListener>(PostHogAnalyticsListener);
  });

  it('should capture user_signed_up on handleUserCreated', () => {
    const payload: UserCreatedEvent = {
      userId: 'user-abc',
      email: 'creator@example.com',
      name: 'Adeola Johnson',
    };

    listener.handleUserCreated(payload);

    expect(postHogService.capture).toHaveBeenCalledWith({
      distinctId: 'user-abc',
      event: 'user_signed_up',
      properties: {
        email: 'creator@example.com',
        name: 'Adeola Johnson',
      },
    });
  });

  it('should capture user_logged_in on handleUserLogin', () => {
    const payload: UserLoginEvent = {
      userId: 'user-xyz',
      email: 'creator@example.com',
      ipAddress: '127.0.0.1',
    };

    listener.handleUserLogin(payload);

    expect(postHogService.capture).toHaveBeenCalledWith({
      distinctId: 'user-xyz',
      event: 'user_logged_in',
      properties: {
        ip_address: '127.0.0.1',
      },
    });
  });
});
