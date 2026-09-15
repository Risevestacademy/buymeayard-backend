// apps/api/src/modules/analytics/listeners/user-audit.listener.ts

import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogService } from '../audit-log.service';
import {
  USER_EVENTS,
  UserCreatedEvent,
  UserLoginEvent,
} from '../events/user.events';

@Injectable()
export class UserAuditListener {
  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent(USER_EVENTS.CREATED)
  async handleUserCreated(payload: UserCreatedEvent): Promise<void> {
    await this.auditLogService.record({
      actorId: payload.userId,
      action: USER_EVENTS.CREATED,
      resourceType: 'User',
      resourceId: payload.userId,
      metadata: { email: payload.email, name: payload.name },
    });
  }

  @OnEvent(USER_EVENTS.LOGIN)
  async handleUserLogin(payload: UserLoginEvent): Promise<void> {
    await this.auditLogService.record({
      actorId: payload.userId,
      action: USER_EVENTS.LOGIN,
      resourceType: 'User',
      resourceId: payload.userId,
      ipAddress: payload.ipAddress,
    });
  }
}