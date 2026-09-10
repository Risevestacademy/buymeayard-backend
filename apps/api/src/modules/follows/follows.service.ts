import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async followCreator(supporterId: string, creatorId: string) {
    return this.prisma.follow.upsert({
      where: {
        supporterId_creatorId: {
          supporterId,
          creatorId,
        },
      },
      update: {},
      create: {
        supporterId,
        creatorId,
      },
    });
  }

  async unfollowCreator(supporterId: string, creatorId: string) {
    return this.prisma.follow.deleteMany({
      where: {
        supporterId,
        creatorId,
      },
    });
  }

  async getFollowing(supporterId: string) {
    return this.prisma.follow.findMany({
      where: { supporterId },
      include: {
        creator: true,
      },
    });
  }
}
