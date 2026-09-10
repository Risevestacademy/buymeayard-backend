import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(_query?: { category?: string; search?: string }) {
    return this.prisma.creatorProfile.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        category: true,
        socialLinks: true,
      },
    });
  }

  async findByUsername(username: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { username },
      include: {
        category: true,
        socialLinks: true,
        materials: {
          include: {
            material: true,
          },
        },
      },
    });

    if (!creator) {
      throw new NotFoundException(
        `Creator with username ${username} not found`,
      );
    }

    return creator;
  }

  async findByUserId(userId: string) {
    return this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: {
        category: true,
        socialLinks: true,
        materials: true,
      },
    });
  }
}
