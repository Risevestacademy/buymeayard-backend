import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { RefundsService } from '../../payments/refunds.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import { lagosDayEnd, lagosDayStart } from '../dto/admin-query.dto';
import {
  AdminRefundDto,
  AdminRefundsQueryDto,
  AdminSupportsQueryDto,
} from './admin-supports.dto';

const SUPPORT_LIST_INCLUDE = {
  creator: { select: { id: true, slug: true, creatorName: true } },
  payment: {
    select: { id: true, status: true, providerReference: true, paidAt: true },
  },
  items: { select: { materialNameSnapshot: true, quantity: true } },
} satisfies Prisma.SupportInclude;

function dateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: lagosDayStart(from) }),
    ...(to && { lt: lagosDayEnd(to) }),
  };
}

@Injectable()
export class AdminSupportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly refunds: RefundsService,
  ) {}

  async list(query: AdminSupportsQueryDto) {
    const createdAt = dateFilter(query.from, query.to);
    const where: Prisma.SupportWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.creatorId && { creatorId: query.creatorId }),
      ...(createdAt && { createdAt }),
      ...(query.search && {
        OR: [
          { guestName: { contains: query.search, mode: 'insensitive' } },
          { guestEmail: { contains: query.search, mode: 'insensitive' } },
          { message: { contains: query.search, mode: 'insensitive' } },
          { payment: { providerReference: { contains: query.search } } },
          {
            creator: { slug: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };
    const [total, supports] = await Promise.all([
      this.prisma.support.count({ where }),
      this.prisma.support.findMany({
        where,
        include: SUPPORT_LIST_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: supports,
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const support = await this.prisma.support.findUnique({
      where: { id },
      include: {
        ...SUPPORT_LIST_INCLUDE,
        items: true,
        payment: { include: { refunds: { orderBy: { createdAt: 'desc' } } } },
        tickets: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Contribution not found',
      });
    }
    const transactionIds = [
      support.payment?.id,
      ...(support.payment?.refunds.map((r) => r.id) ?? []),
    ].filter((v): v is string => !!v);
    const ledgerEntries = transactionIds.length
      ? await this.prisma.ledgerEntry.findMany({
          where: { transactionId: { in: transactionIds } },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    return { ...support, ledgerEntries };
  }

  async refund(id: string, adminId: string, dto: AdminRefundDto) {
    const refund = await this.refunds.initiateRefund(id, {
      adminId,
      reason: dto.reason,
      allowNegativeBalance: dto.allowNegativeBalance,
    });
    await this.audit.record({
      actorId: adminId,
      action: 'admin.support.refunded',
      resourceType: 'Support',
      resourceId: id,
      newState: {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      },
      metadata: {
        reason: dto.reason,
        allowNegativeBalance: !!dto.allowNegativeBalance,
      },
    });
    return refund;
  }

  async listRefunds(query: AdminRefundsQueryDto) {
    const createdAt = dateFilter(query.from, query.to);
    const where: Prisma.RefundWhereInput = {
      ...(query.status && { status: query.status }),
      ...(createdAt && { createdAt }),
    };
    const [total, refunds] = await Promise.all([
      this.prisma.refund.count({ where }),
      this.prisma.refund.findMany({
        where,
        include: {
          payment: {
            select: {
              supportId: true,
              providerReference: true,
              support: {
                select: {
                  creator: {
                    select: { id: true, slug: true, creatorName: true },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: refunds,
      pagination: buildPagination(query.page, query.limit, total),
    };
  }
}
