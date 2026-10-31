import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MoneyUtil } from '../../../common/utils/money.util';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { PayoutsService } from '../../payouts/payouts.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import { lagosDayEnd, lagosDayStart } from '../dto/admin-query.dto';
import { AdminPayoutsQueryDto } from './admin-payouts.dto';

const CREATOR_SELECT = {
  id: true,
  slug: true,
  creatorName: true,
  avatarUrl: true,
} satisfies Prisma.CreatorProfileSelect;

const MONEY_KEYS = ['amount', 'fee', 'netAmount'];

/** Admin screens show naira; the database stores kobo. */
const inNaira = <T>(row: T): T => MoneyUtil.toMajorDeep(row, MONEY_KEYS);

@Injectable()
export class AdminPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly payouts: PayoutsService,
  ) {}

  async list(query: AdminPayoutsQueryDto) {
    const where: Prisma.PayoutWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.creatorId && { creatorId: query.creatorId }),
      ...((query.from || query.to) && {
        requestedAt: {
          ...(query.from && { gte: lagosDayStart(query.from) }),
          ...(query.to && { lt: lagosDayEnd(query.to) }),
        },
      }),
      ...(query.search && {
        OR: [
          { reference: { contains: query.search, mode: 'insensitive' } },
          { accountName: { contains: query.search, mode: 'insensitive' } },
          {
            creator: { slug: { contains: query.search, mode: 'insensitive' } },
          },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.payout.count({ where }),
      this.prisma.payout.findMany({
        where,
        include: { creator: { select: CREATOR_SELECT } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: items.map(inNaira),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        creator: { select: CREATOR_SELECT },
        events: { orderBy: { createdAt: 'asc' } },
        tickets: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (!payout) {
      throw new NotFoundException({
        code: ErrorCodes.PAYOUT_NOT_FOUND,
        message: 'Payout not found',
      });
    }
    const ledgerEntries = await this.prisma.ledgerEntry.findMany({
      where: { transactionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return inNaira({ ...payout, ledgerEntries });
  }

  async reconcile(id: string, adminId: string) {
    const before = await this.get(id);
    await this.payouts.reconcilePayout(id);
    return this.audited(id, adminId, 'reconciled', before.status);
  }

  async retry(id: string, adminId: string) {
    const before = await this.get(id);
    await this.payouts.retryTransfer(id);
    return this.audited(id, adminId, 'retried', before.status);
  }

  async cancel(id: string, adminId: string, reason: string) {
    const before = await this.get(id);
    await this.payouts.cancelPayout(id, reason);
    return this.audited(id, adminId, 'cancelled', before.status, reason);
  }

  private async audited(
    id: string,
    adminId: string,
    verb: string,
    previousStatus: string,
    reason?: string,
  ) {
    const after = await this.get(id);
    await this.audit.record({
      actorId: adminId,
      action: `admin.payout.${verb}`,
      resourceType: 'Payout',
      resourceId: id,
      previousState: { status: previousStatus },
      newState: { status: after.status },
      ...(reason && { metadata: { reason } }),
    });
    return after;
  }
}
