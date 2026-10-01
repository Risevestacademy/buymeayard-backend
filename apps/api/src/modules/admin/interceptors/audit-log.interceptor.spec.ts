import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import { AuditLogService } from '../../analytics/audit-log.service';

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let reflector: { getAllAndOverride: jest.Mock };
  let auditLogService: { record: jest.Mock };

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogInterceptor,
        { provide: Reflector, useValue: reflector },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    interceptor = module.get<AuditLogInterceptor>(AuditLogInterceptor);
  });

  const createMockContext = (request: Record<string, any>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  const createMockHandler = (result: any = {}): CallHandler => ({
    handle: () => of(result),
  });

  it('should skip audit log when route has no @AuditLog metadata', (done) => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockContext({ url: '/test' });
    const handler = createMockHandler({ success: true });

    interceptor.intercept(context, handler).subscribe({
      next: (val) => {
        expect(val).toEqual({ success: true });
        expect(auditLogService.record).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should record audit log extracting id from request.params', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'admin.user.ban',
      resourceType: 'User',
    });

    const context = createMockContext({
      user: { id: 'admin-123' },
      params: { id: 'target-user-456' },
      ip: '10.0.0.1',
    });
    const handler = createMockHandler({ banned: true });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditLogService.record).toHaveBeenCalledWith({
          actorId: 'admin-123',
          action: 'admin.user.ban',
          resourceType: 'User',
          resourceId: 'target-user-456',
          ipAddress: '10.0.0.1',
        });
        done();
      },
    });
  });

  it('should use custom resolveResourceId when provided', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'admin.category.update',
      resourceType: 'Category',
      resolveResourceId: (req: any) => req.body?.categoryId,
    });

    const context = createMockContext({
      user: { id: 'admin-123' },
      body: { categoryId: 'cat-789', name: 'Art' },
      ip: '10.0.0.1',
    });
    const handler = createMockHandler({ updated: true });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditLogService.record).toHaveBeenCalledWith({
          actorId: 'admin-123',
          action: 'admin.category.update',
          resourceType: 'Category',
          resourceId: 'cat-789',
          ipAddress: '10.0.0.1',
        });
        done();
      },
    });
  });

  it('should fallback resourceId to SYSTEM when no id is available', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'admin.dashboard.view',
      resourceType: 'AdminDashboard',
    });

    const context = createMockContext({
      user: undefined,
      params: {},
      ip: '10.0.0.1',
    });
    const handler = createMockHandler({ metrics: {} });

    interceptor.intercept(context, handler).subscribe({
      next: () => {
        expect(auditLogService.record).toHaveBeenCalledWith({
          actorId: undefined,
          action: 'admin.dashboard.view',
          resourceType: 'AdminDashboard',
          resourceId: 'SYSTEM',
          ipAddress: '10.0.0.1',
        });
        done();
      },
    });
  });

  it('should not record audit log if the handler throws an error', (done) => {
    reflector.getAllAndOverride.mockReturnValue({
      action: 'admin.delete',
      resourceType: 'Item',
    });

    const context = createMockContext({ params: { id: '1' } });
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('Handler failed')),
    };

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(auditLogService.record).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
