import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import {
  AdminTicketsQueryDto,
  AdminUpdateTicketDto,
} from './admin-tickets.dto';

const USER_SELECT = { id: true, email: true, name: true } as const;

@Injectable()
export class AdminTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(query: AdminTicketsQueryDto) {
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.search && {
        OR: [
          { message: { contains: query.search, mode: 'insensitive' } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.findMany({
        where,
        include: { user: { select: USER_SELECT } },
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
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: { select: USER_SELECT },
        payout: {
          select: {
            id: true,
            reference: true,
            status: true,
            amount: true,
            failureReason: true,
          },
        },
        support: {
          select: {
            id: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
    });
    if (!ticket) this.notFound();
    return ticket;
  }

  async update(id: string, adminId: string, dto: AdminUpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
    });
    if (!ticket) this.notFound();

    const resolved = dto.status === 'RESOLVED';
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedBy: resolved ? adminId : null,
        resolvedAt: resolved ? new Date() : null,
        resolutionNote: resolved ? dto.note : null,
      },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'admin.support_ticket.updated',
      resourceType: 'SupportTicket',
      resourceId: id,
      previousState: { status: ticket.status },
      newState: { status: dto.status },
      metadata: { note: dto.note },
    });
    return this.get(id);
  }

  private notFound(): never {
    throw new NotFoundException({
      code: ErrorCodes.NOT_FOUND,
      message: 'Support ticket not found',
    });
  }
}
