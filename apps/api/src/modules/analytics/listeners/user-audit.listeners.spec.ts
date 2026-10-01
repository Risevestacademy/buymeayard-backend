import { Test, TestingModule } from '@nestjs/testing';
import { UserAuditListener } from './user-audit.listeners';
import { AuditLogService } from '../audit-log.service';
import {
  USER_EVENTS,
  UserCreatedEvent,
  UserLoginEvent,
} from '../events/user.events';

describe('UserAuditListener', () => {
  let listener: UserAuditListener;
  let auditLogService: { record: jest.Mock };

  beforeEach(async () => {
    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAuditListener,
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    listener = module.get<UserAuditListener>(UserAuditListener);
  });

  it('should record user.created audit log on handleUserCreated', async () => {
    const payload: UserCreatedEvent = {
      userId: 'user-001',
      email: 'creator@example.com',
      name: 'Adeola Johnson',
    };

    await listener.handleUserCreated(payload);

    expect(auditLogService.record).toHaveBeenCalledWith({
      actorId: 'user-001',
      action: USER_EVENTS.CREATED,
      resourceType: 'User',
      resourceId: 'user-001',
      metadata: { email: 'creator@example.com', name: 'Adeola Johnson' },
    });
  });

  it('should record user.login audit log on handleUserLogin', async () => {
    const payload: UserLoginEvent = {
      userId: 'user-002',
      email: 'supporter@example.com',
      ipAddress: '192.168.1.1',
    };

    await listener.handleUserLogin(payload);

    expect(auditLogService.record).toHaveBeenCalledWith({
      actorId: 'user-002',
      action: USER_EVENTS.LOGIN,
      resourceType: 'User',
      resourceId: 'user-002',
      ipAddress: '192.168.1.1',
    });
  });
});
