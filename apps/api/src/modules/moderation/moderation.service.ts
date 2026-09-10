import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async reportContent(
    reporterId: string,
    contentId: string,
    reason: string,
    description?: string,
  ) {
    return this.prisma.contentReport.create({
      data: {
        reporterId,
        contentId,
        reason,
        description,
        status: 'PENDING',
      },
    });
  }
}
