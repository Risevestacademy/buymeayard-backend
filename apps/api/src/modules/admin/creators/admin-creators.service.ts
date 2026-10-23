import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { LedgerService } from '../../ledger/ledger.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import { AccountType, CreatorStatus, KycStatus } from '@buymeayard/types';
import { IN_FLIGHT_PAYOUT_STATUSES } from '../../payouts/payouts.service';
import {
  AdminCreatorsQueryDto,
  AdminSetCreatorStatusDto,
} from './admin-creators.dto';

const PAID = ['PAID', 'COMPLETED'];

const LIST_SELECT = {
  id: true,
  slug: true,
  creatorName: true,
  avatarUrl: true,
  status: true,
  kycStatus: true,
  isPublished: true,
  createdAt: true,
  user: { select: { id: true, email: true, name: true, status: true } },
} satisfies Prisma.CreatorProfileSelect;

@Injectable()
export class AdminCreatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly ledger: LedgerService,
  ) {}

  async list(query: AdminCreatorsQueryDto) {
    const where: Prisma.CreatorProfileWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.kycStatus && { kycStatus: query.kycStatus }),
      ...(query.search && {
        OR: [
          { creatorName: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [total, creators] = await Promise.all([
      this.prisma.creatorProfile.count({ where }),
      this.prisma.creatorProfile.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [
          { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
          { id: 'desc' },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const totals = await this.prisma.support.groupBy({
      by: ['creatorId'],
      where: {
        creatorId: { in: creators.map((c) => c.id) },
        status: { in: PAID },
      },
      _sum: { totalAmount: true },
      _count: true,
    });
    const byCreator = new Map(totals.map((t) => [t.creatorId, t]));

    return {
      items: creators.map((c) => ({
        ...c,
        contributed: byCreator.get(c.id)?._sum.totalAmount ?? 0,
        contributionCount: byCreator.get(c.id)?._count ?? 0,
      })),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            emailVerified: true,
          },
        },
        socialLinks: true,
        payoutMethods: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            bankName: true,
            accountName: true,
            accountIdentifier: true,
            verifiedAt: true,
          },
        },
        kycSubmissions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });
    if (!creator) this.notFound();

    const account = await this.ledger.getOrCreateAccount(
      AccountType.CREATOR,
      id,
    );
    const [balance, contributions, payoutsByStatus, history, inFlight] =
      await Promise.all([
        this.ledger.getAccountBalance(account.id),
        this.prisma.support.aggregate({
          where: { creatorId: id, status: { in: PAID } },
          _sum: { totalAmount: true, creatorAmount: true, platformFee: true },
          _count: true,
        }),
        this.prisma.payout.groupBy({
          by: ['status'],
          where: { creatorId: id },
          _sum: { netAmount: true },
          _count: true,
        }),
        this.prisma.auditLog.findMany({
          where: { resourceType: 'CreatorProfile', resourceId: id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.prisma.payout.aggregate({
          where: { creatorId: id, status: { in: IN_FLIGHT_PAYOUT_STATUSES } },
          _sum: { amount: true },
        }),
      ]);

    const { payoutMethods, kycSubmissions, ...profile } = creator;
    return {
      ...profile,
      payoutMethod: payoutMethods[0]
        ? {
            ...payoutMethods[0],
            accountIdentifier: `••••${payoutMethods[0].accountIdentifier.slice(-4)}`,
          }
        : null,
      latestKycSubmission: kycSubmissions[0] ?? null,
      balance: {
        available: balance,
        inFlightPayouts: inFlight._sum.amount ?? 0,
        currency: 'NGN',
      },
      contributions: {
        count: contributions._count,
        gross: contributions._sum.totalAmount ?? 0,
        net: contributions._sum.creatorAmount ?? 0,
        platformFees: contributions._sum.platformFee ?? 0,
      },
      payouts: payoutsByStatus.map((p) => ({
        status: p.status,
        count: p._count,
        netAmount: p._sum.netAmount ?? 0,
      })),
      history,
    };
  }

  /** Changes a creator's standing. Suspending or banning also unpublishes the page. */
  async setStatus(id: string, adminId: string, dto: AdminSetCreatorStatusDto) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { id },
      select: { id: true, status: true, kycStatus: true, kycBlockedAt: true },
    });
    if (!creator) this.notFound();

    if (
      dto.status === CreatorStatus.ACTIVE &&
      (creator.kycStatus !== KycStatus.VERIFIED || creator.kycBlockedAt)
    ) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_STATUS_CHANGE,
        message:
          'A creator can only be reactivated once their identity is verified and not blocked',
      });
    }

    await this.prisma.creatorProfile.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status !== CreatorStatus.ACTIVE && { isPublished: false }),
      },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'admin.creator.status_changed',
      resourceType: 'CreatorProfile',
      resourceId: id,
      previousState: { status: creator.status },
      newState: { status: dto.status },
      metadata: { reason: dto.reason },
    });
    return this.get(id);
  }

  async unpublish(id: string, adminId: string, reason: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { id },
      select: { isPublished: true },
    });
    if (!creator) this.notFound();
    await this.prisma.creatorProfile.update({
      where: { id },
      data: { isPublished: false },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'admin.creator.unpublished',
      resourceType: 'CreatorProfile',
      resourceId: id,
      previousState: { isPublished: creator.isPublished },
      newState: { isPublished: false },
      metadata: { reason },
    });
    return this.get(id);
  }

  private notFound(): never {
    throw new NotFoundException({
      code: ErrorCodes.CREATOR_NOT_FOUND,
      message: 'Creator not found',
    });
  }
}
