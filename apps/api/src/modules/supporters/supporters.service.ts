import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class SupportersService {
  constructor(private readonly prisma: PrismaService) {}

  async getSupportHistory(supporterId: string) {
    return this.prisma.support.findMany({
      where: { supporterId },
      include: {
        creator: true,
        items: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
