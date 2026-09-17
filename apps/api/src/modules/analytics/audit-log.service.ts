// apps/api/src/modules/analytics/audit-log.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service'; // adjust path to your actual PrismaService
import { Prisma} from '@prisma/client';

export interface RecordAuditLogParams {
  actorId?: string;
  action: string; // e.g. 'user.login', 'admin.user.deleted'
  resourceType: string;
  resourceId: string;
  previousState?: Prisma.InputJsonValue;
  newState?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(params: RecordAuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          previousState: params.previousState,
          newState: params.newState,
          metadata: params.metadata,
          ipAddress: params.ipAddress,
        },
      });
    } catch (error) {
      // Audit logging should never break the primary request/flow.
      // Log the failure loudly instead of throwing.
      this.logger.error(
        `Failed to write audit log for action "${params.action}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}