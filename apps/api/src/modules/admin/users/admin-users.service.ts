import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { buildPagination } from '../../../common/utils/pagination.util';
import {
  CreatorStatus,
  KycStatus,
  UserRole,
  UserStatus,
} from '@buymeayard/types';
import { AdminSetUserStatusDto, AdminUsersQueryDto } from './admin-users.dto';

const USER_LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  status: true,
  emailVerified: true,
  createdAt: true,
  roles: { select: { role: { select: { name: true } } } },
  creatorProfile: { select: { id: true, slug: true, status: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(query: AdminUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.role && { roles: { some: { role: { name: query.role } } } }),
      ...(query.search && {
        OR: [
          { email: { contains: query.search, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: users.map((u) => this.toListItem(u)),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_LIST_SELECT,
        updatedAt: true,
        _count: {
          select: { supportTickets: true, reports: true },
        },
        sessions: {
          select: {
            id: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            expiresAt: true,
          },
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!user) this.notFound();

    const history = await this.prisma.auditLog.findMany({
      where: { resourceType: 'User', resourceId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      ...this.toListItem(user),
      updatedAt: user.updatedAt,
      counts: {
        supportTickets: user._count.supportTickets,
        reportsFiled: user._count.reports,
      },
      activeSessions: user.sessions,
      history,
    };
  }

  /**
   * Suspends, bans or reactivates an account. Suspension signs the user out
   * everywhere and takes their creator page down; reactivating does not
   * re-publish it, the creator does that themselves.
   */
  async setStatus(id: string, adminId: string, dto: AdminSetUserStatusDto) {
    if (id === adminId) {
      throw new ForbiddenException({
        code: ErrorCodes.CANNOT_MODIFY_ADMIN,
        message: 'You cannot change your own account status',
      });
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { name: true } } } },
        creatorProfile: {
          select: { id: true, kycStatus: true, kycBlockedAt: true },
        },
      },
    });
    if (!user) this.notFound();
    if (user.roles.some((r) => r.role.name === UserRole.ADMIN)) {
      throw new ForbiddenException({
        code: ErrorCodes.CANNOT_MODIFY_ADMIN,
        message: 'Admin accounts cannot be suspended or banned from here',
      });
    }

    const previous = user.status;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: dto.status } });

      if (dto.status !== UserStatus.ACTIVE) {
        await tx.session.deleteMany({ where: { userId: id } });
      }
      if (user.creatorProfile) {
        const creator = user.creatorProfile;
        const creatorStatus =
          dto.status === UserStatus.ACTIVE
            ? creator.kycStatus === KycStatus.VERIFIED && !creator.kycBlockedAt
              ? CreatorStatus.ACTIVE
              : CreatorStatus.PROFILE_CREATED
            : dto.status === UserStatus.BANNED
              ? CreatorStatus.BANNED
              : CreatorStatus.SUSPENDED;
        await tx.creatorProfile.update({
          where: { id: creator.id },
          data: {
            status: creatorStatus,
            ...(dto.status !== UserStatus.ACTIVE && { isPublished: false }),
          },
        });
      }
    });

    await this.audit.record({
      actorId: adminId,
      action: 'admin.user.status_changed',
      resourceType: 'User',
      resourceId: id,
      previousState: { status: previous },
      newState: { status: dto.status },
      metadata: { reason: dto.reason },
    });
    return this.get(id);
  }

  private toListItem(
    u: Prisma.UserGetPayload<{ select: typeof USER_LIST_SELECT }>,
  ) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      status: u.status,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => r.role.name),
      creator: u.creatorProfile,
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: ErrorCodes.NOT_FOUND,
      message: 'User not found',
    });
  }
}
