import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { KycStatus } from '@buymeayard/types';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class KycService {
  constructor(private readonly prisma: PrismaService) {}

  async submitKyc(creatorUserId: string, metadata: Record<string, any>) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }

    const submission = await this.prisma.kycSubmission.create({
      data: {
        creatorId: creator.id,
        provider: 'DEFAULT_KYC',
        providerReference: `kyc_${Date.now()}_${creator.id.slice(0, 8)}`,
        status: KycStatus.PENDING,
        metadata,
      },
    });

    await this.prisma.creatorProfile.update({
      where: { id: creator.id },
      data: { kycStatus: KycStatus.PENDING },
    });

    return submission;
  }
}
