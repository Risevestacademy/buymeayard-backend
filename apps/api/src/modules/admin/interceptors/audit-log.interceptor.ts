// apps/api/src/modules/admin/interceptors/audit-log.interceptor.ts

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_LOG_KEY, AuditLogMetadata } from '../decorators/audit-log.decorator';
import { AuditLogService } from '../../analytics/audit-log.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditLogMetadata>(
      AUDIT_LOG_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @AuditLog() on this route — skip entirely, do nothing extra.
    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        // Fires only after the handler resolves successfully — errors skip this.
        this.auditLogService.record({
          actorId: request.user?.id,
          action: metadata.action,
          resourceType: metadata.resourceType,
          resourceId: request.params?.id, // assumes :id route param — adjust if a route differs
          ipAddress: request.ip,
        });
      }),
    );
  }
}