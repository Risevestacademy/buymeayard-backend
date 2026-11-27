// apps/api/src/modules/admin/decorators/audit-log.decorator.ts

import { SetMetadata } from '@nestjs/common';

export const AUDIT_LOG_KEY = 'audit-log-metadata';

export type ResourceIdResolver = (req: any) => string | undefined;

export interface AuditLogMetadata {
  action: string;
  resourceType: string;
  resolveResourceId?: ResourceIdResolver;
}

export const AuditLog = (
  action: string,
  resourceType: string,
  resolveResourceId?: ResourceIdResolver,
) =>
  SetMetadata(AUDIT_LOG_KEY, {
    action,
    resourceType,
    resolveResourceId,
  } satisfies AuditLogMetadata);
