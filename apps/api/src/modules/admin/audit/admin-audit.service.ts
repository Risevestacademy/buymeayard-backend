import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import { lagosDayEnd, lagosDayStart } from '../dto/admin-query.dto';
import { AdminAuditLogsQueryDto } from './admin-audit.dto';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminAuditLogsQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.action && { action: query.action }),
      ...(query.resourceType && { resourceType: query.resourceType }),
      ...(query.resourceId && { resourceId: query.resourceId }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: lagosDayStart(query.from) }),
          ...(query.to && { lt: lagosDayEnd(query.to) }),
        },
      }),
      ...(query.search && {
        OR: [
          { action: { contains: query.search, mode: 'insensitive' } },
          { resourceId: { contains: query.search } },
        ],
      }),
    };
    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const actorIds = [
      ...new Set(logs.map((l) => l.actorId).filter((v): v is string => !!v)),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(actors.map((a) => [a.id, a]));

    return {
      items: logs.map((l) => ({
        ...l,
        actor: l.actorId ? (byId.get(l.actorId) ?? null) : null,
      })),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Audit log not found',
      });
    }
    const actor = log.actorId
      ? await this.prisma.user.findUnique({
          where: { id: log.actorId },
          select: { id: true, name: true, email: true },
        })
      : null;
    return { ...log, actor };
  }
}
