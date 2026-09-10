import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary() {
    const [totalUsers, totalCreators, totalSupports, totalPayouts] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.creatorProfile.count(),
        this.prisma.support.count(),
        this.prisma.payout.count(),
      ]);

    return {
      totalUsers,
      totalCreators,
      totalSupports,
      totalPayouts,
    };
  }

  async getAuditLogs(limit = 50) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
