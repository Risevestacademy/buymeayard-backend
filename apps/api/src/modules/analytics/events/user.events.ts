// apps/api/src/modules/analytics/events/user.events.ts

export const USER_EVENTS = {
  CREATED: 'user.created',
  LOGIN: 'user.login',
} as const;

export interface UserCreatedEvent {
  userId: string;
  email: string;
  name?: string;
}

export interface UserLoginEvent {
  userId: string;
  email: string;
  ipAddress?: string;
}