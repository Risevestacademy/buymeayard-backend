import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MoneyUtil } from '../../common/utils/money.util';
import { ErrorCodes } from '../../common/errors/error-codes';
import { CreateSupportDto } from './dto/create-support.dto';

@Injectable()
export class SupportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createSupport(supporterUserId: string, dto: CreateSupportDto) {
    // 1. Validate creator exists and is active
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { id: dto.creatorId },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }

    // 2. Prevent self-support
    if (creator.userId === supporterUserId) {
      throw new BadRequestException({
        code: ErrorCodes.SELF_SUPPORT_NOT_ALLOWED,
        message: 'Creators cannot support their own account',
      });
    }

    // 3. Retrieve creator materials and calculate authoritative amounts
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'At least one yard material must be selected',
      });
    }

    let subtotal = 0;
    const itemsToCreate = [];

    for (const item of dto.items) {
      if (item.quantity <= 0) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Yard quantity must be greater than 0',
        });
      }

      const creatorMat = await this.prisma.creatorMaterial.findUnique({
        where: { id: item.creatorMaterialId },
        include: { material: true },
      });

      if (
        !creatorMat ||
        creatorMat.creatorId !== creator.id ||
        creatorMat.status !== 'ACTIVE'
      ) {
        throw new BadRequestException({
          code: ErrorCodes.MATERIAL_NOT_FOUND,
          message: `Material is unavailable or inactive for this creator`,
        });
      }

      const itemTotal = creatorMat.price * item.quantity;
      subtotal += itemTotal;

      itemsToCreate.push({
        creatorMaterialId: creatorMat.id,
        materialNameSnapshot:
          creatorMat.displayName || creatorMat.material.name,
        unitPrice: creatorMat.price,
        quantity: item.quantity,
        totalPrice: itemTotal,
        currency: creatorMat.currency,
      });
    }

    const feePercentage =
      this.configService.get<number>('PLATFORM_FEE_PERCENTAGE') || 10;
    const { platformFee, creatorAmount } = MoneyUtil.calculateSplit(
      subtotal,
      feePercentage,
    );

    // 4. Create Support record with snapshot items
    return this.prisma.support.create({
      data: {
        supporterId: supporterUserId,
        creatorId: creator.id,
        subtotal,
        platformFee,
        creatorAmount,
        totalAmount: subtotal,
        currency: itemsToCreate[0].currency,
        message: dto.message,
        isAnonymous: dto.isAnonymous ?? false,
        status: 'CREATED',
        items: {
          create: itemsToCreate,
        },
      },
      include: {
        items: true,
      },
    });
  }

  async findById(id: string) {
    const support = await this.prisma.support.findUnique({
      where: { id },
      include: {
        creator: true,
        items: true,
        payment: true,
      },
    });

    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Support transaction not found',
      });
    }

    return support;
  }
}
