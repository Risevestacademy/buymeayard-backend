import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import { PostStatus } from '@buymeayard/types';
import {
  AdminReportsQueryDto,
  AdminUpdateReportDto,
} from './admin-reports.dto';

@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(query: AdminReportsQueryDto) {
    const where: Prisma.ContentReportWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { reason: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.contentReport.count({ where }),
      this.prisma.contentReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, email: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items,
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const report = await this.prisma.contentReport.findUnique({
      where: { id },
      include: { reporter: { select: { id: true, email: true, name: true } } },
    });
    if (!report) this.notFound();
    const [post, otherReports] = await Promise.all([
      this.prisma.post.findUnique({
        where: { id: report.contentId },
        select: {
          id: true,
          title: true,
          body: true,
          status: true,
          visibility: true,
          creator: { select: { id: true, slug: true, creatorName: true } },
        },
      }),
      this.prisma.contentReport.count({
        where: { contentId: report.contentId, id: { not: id } },
      }),
    ]);
    return { ...report, post, otherReportsOnContent: otherReports };
  }

  async update(id: string, adminId: string, dto: AdminUpdateReportDto) {
    const report = await this.prisma.contentReport.findUnique({
      where: { id },
    });
    if (!report) this.notFound();

    await this.prisma.$transaction(async (tx) => {
      await tx.contentReport.update({
        where: { id },
        data: {
          status: dto.status,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          resolutionNote: dto.note,
        },
      });
      if (dto.status === 'RESOLVED' && dto.removeContent) {
        await tx.post.updateMany({
          where: { id: report.contentId },
          data: { status: PostStatus.ARCHIVED },
        });
      }
    });
    await this.audit.record({
      actorId: adminId,
      action: 'admin.report.updated',
      resourceType: 'ContentReport',
      resourceId: id,
      previousState: { status: report.status },
      newState: { status: dto.status },
      metadata: { note: dto.note, removedContent: !!dto.removeContent },
    });
    return this.get(id);
  }

  private notFound(): never {
    throw new NotFoundException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Report not found',
    });
  }
}
