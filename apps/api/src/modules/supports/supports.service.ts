import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreatorStatus } from '@buymeayard/types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { MoneyUtil } from '../../common/utils/money.util';
import { ErrorCodes } from '../../common/errors/error-codes';
import { CreateSupportDto } from './dto/create-support.dto';
import { Prisma } from '@prisma/client';
import { CreateSupportIntentDto } from '../creators/dto/create-support-intent.dto';
import { SupportStatus } from '@buymeayard/types';
import {
  SupportWallQueryDto,
  SupportWallResponseDto,
} from './dto/support-wall.dto';
import {
  decodeWallCursor,
  buildCursorWhere,
  toCursorPage,
} from './utils/wall-cursor.util';
import {
  SUPPORT_WALL_SELECT,
  toSupportWallItem,
} from './mappers/support-wall.mapper';
import { CreatorSupportListResponseDto } from './dto/creator-support.dto';
import {
  CREATOR_SUPPORT_SELECT,
  toCreatorSupportItem,
} from './mappers/creator-support.mapper';
// const SUPPORT_WALL_DEFAULT_LIMIT = 20;
// const PUBLIC_WALL_STATUSES = [SupportStatus.PAID, SupportStatus.COMPLETED];

const SUPPORT_PAGE_DEFAULT_LIMIT = 20;
const RECEIVED_SUPPORT_STATUSES = [SupportStatus.PAID, SupportStatus.COMPLETED];

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

    // Only verified, published creators may receive contributions.
    if (creator.status !== CreatorStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCodes.CREATOR_NOT_ACTIVE,
        message: 'This creator is not accepting contributions yet',
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

  async createGuestIntent(creatorId: string, dto: CreateSupportIntentDto) {
    const creatorMaterial = await this.prisma.creatorMaterial.findFirst({
      where: { creatorId, status: 'ACTIVE' },
      include: { material: true },
    });

    if (!creatorMaterial) {
      throw new BadRequestException({
        code: ErrorCodes.MATERIAL_NOT_FOUND,
        message: 'This creator has no active materials available for support',
      });
    }

    const amountMinor = MoneyUtil.toMinorUnits(dto.amount);

    const feePercentage =
      this.configService.get<number>('PLATFORM_FEE_PERCENTAGE') || 10;
    const { platformFee, creatorAmount } = MoneyUtil.calculateSplit(
      amountMinor,
      feePercentage,
    );
    const quantity = new Prisma.Decimal(amountMinor).div(creatorMaterial.price);

    return this.prisma.support.create({
      data: {
        supporterId: null,
        guestName: dto.name,
        creatorId,
        subtotal: amountMinor,
        platformFee,
        creatorAmount,
        totalAmount: amountMinor,
        currency: creatorMaterial.currency,
        message: dto.message,
        isAnonymous: dto.isAnonymous ?? false,
        status: 'CREATED',
        items: {
          create: [
            {
              creatorMaterialId: creatorMaterial.id,
              materialNameSnapshot:
                creatorMaterial.displayName || creatorMaterial.material.name,
              unitPrice: creatorMaterial.price,
              quantity,
              totalPrice: amountMinor,
              currency: creatorMaterial.currency,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  async getPublicWall(
    slug: string,
    query: SupportWallQueryDto,
  ): Promise<SupportWallResponseDto> {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { slug },
      select: { id: true, isPublished: true, showSupportersOnPage: true },
    });

    if (!creator || !creator.isPublished) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }

    if (!creator.showSupportersOnPage) {
      return { items: [], nextCursor: null };
    }

    const limit = query.limit ?? SUPPORT_PAGE_DEFAULT_LIMIT;
    const cursor = query.cursor ? decodeWallCursor(query.cursor) : null;

    const rows = await this.prisma.support.findMany({
      where: {
        creatorId: creator.id,
        status: { in: RECEIVED_SUPPORT_STATUSES },
        ...buildCursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: SUPPORT_WALL_SELECT,
    });

    return toCursorPage(rows, limit, toSupportWallItem);
  }

  async getCreatorSupports(
    userId: string,
    query: SupportWallQueryDto,
  ): Promise<CreatorSupportListResponseDto> {
    // The creator comes from the logged-in session, never from the request,
    // so one creator can never read another creator's gifts.
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator profile not found',
      });
    }

    const limit = query.limit ?? SUPPORT_PAGE_DEFAULT_LIMIT;
    const cursor = query.cursor ? decodeWallCursor(query.cursor) : null;

    const rows = await this.prisma.support.findMany({
      where: {
        creatorId: creator.id,
        status: { in: RECEIVED_SUPPORT_STATUSES },
        ...buildCursorWhere(cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: CREATOR_SUPPORT_SELECT,
    });

    return toCursorPage(rows, limit, toCreatorSupportItem);
  }
}
