// apps/api/src/modules/admin/decorators/audit-log.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'audit-log-metadata';

export interface AuditLogMetadata {
  action: string;
  resourceType: string;
}

export const AuditLog = (action: string, resourceType: string) =>
  SetMetadata(AUDIT_LOG_KEY, { action, resourceType } satisfies AuditLogMetadata);