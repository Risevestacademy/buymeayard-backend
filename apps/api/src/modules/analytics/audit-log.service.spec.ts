import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should write audit log with provided parameters', async () => {
    await service.record({
      actorId: 'admin-1',
      action: 'admin.user.blocked',
      resourceType: 'User',
      resourceId: 'target-user-99',
      ipAddress: '127.0.0.1',
      metadata: { reason: 'spam' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'admin.user.blocked',
        resourceType: 'User',
        resourceId: 'target-user-99',
        ipAddress: '127.0.0.1',
        metadata: { reason: 'spam' },
        newState: undefined,
        previousState: undefined,
      },
    });
  });

  it('should fallback resourceId to SYSTEM when not provided', async () => {
    await service.record({
      action: 'system.maintenance.start',
      resourceType: 'System',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'system.maintenance.start',
        resourceType: 'System',
        resourceId: 'SYSTEM',
      }),
    });
  });

  it('should catch database errors gracefully without throwing', async () => {
    prisma.auditLog.create.mockRejectedValue(
      new Error('DB connection refused'),
    );

    await expect(
      service.record({
        action: 'user.login',
        resourceType: 'User',
        resourceId: 'u-1',
      }),
    ).resolves.not.toThrow();
  });
});
