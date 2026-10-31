import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { CreatorStatus } from '@buymeayard/types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DEFAULT_PAGE_LIMIT } from '../../common/dto/page-query.dto';
import { buildCursorPagination } from '../../common/utils/pagination.util';
import { MoneyUtil } from '../../common/utils/money.util';
import { ErrorCodes } from '../../common/errors/error-codes';
import { Prisma } from '@prisma/client';
import {
  CreateSupportIntentDto,
  SupportQuoteQueryDto,
} from '../creators/dto/create-support-intent.dto';
import { SupportStatus } from '@buymeayard/types';
import {
  SupportWallQueryDto,
  SupportWallResponseDto,
} from './dto/support-wall.dto';
import {
  SupportIntentResponseDto,
  SupportQuoteResponseDto,
} from './dto/guest-support.dto';
import { toContributionMaterial } from './mappers/contribution-material.mapper';
import { resolveThankYouMessage } from './utils/thank-you-message.util';
import {
  decodeWallCursor,
  buildCursorWhere,
  toCursorPage,
} from './utils/wall-cursor.util';
import {
  SUPPORT_WALL_SELECT,
  toSupportWallItem,
} from './mappers/support-wall.mapper';
const RECEIVED_SUPPORT_STATUSES = [SupportStatus.PAID, SupportStatus.COMPLETED];

// Yards are stored with 2 decimals (support_items.quantity is DECIMAL(10,2)).
const YARD_DECIMAL_PLACES = 2;

@Injectable()
export class SupportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  /**
   * The fabric a guest gift is counted in: the creator's theme fabric when it
   * is on their active menu, otherwise their oldest active material.
   */
  private async findGiftMaterial(
    creatorId: string,
    themeMaterialId: string | null,
  ) {
    const include = { material: true };
    const themed = themeMaterialId
      ? await this.prisma.creatorMaterial.findFirst({
          where: { creatorId, materialId: themeMaterialId, status: 'ACTIVE' },
          include,
        })
      : null;
    const creatorMaterial =
      themed ??
      (await this.prisma.creatorMaterial.findFirst({
        where: { creatorId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        include,
      }));

    if (!creatorMaterial || creatorMaterial.price <= 0) {
      throw new BadRequestException({
        code: ErrorCodes.MATERIAL_NOT_FOUND,
        message: 'This creator has no active materials available for support',
      });
    }
    return creatorMaterial;
  }

  private async getGiftableCreator(slug: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: {
        id: true,
        status: true,
        isPublished: true,
        themeMaterialId: true,
        thankYouMessage: true,
      },
    });

    if (!creator || !creator.isPublished) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }
    if (creator.status !== CreatorStatus.ACTIVE) {
      throw new ForbiddenException({
        code: ErrorCodes.CREATOR_NOT_ACTIVE,
        message: 'This creator is not accepting contributions yet',
      });
    }
    return creator;
  }

  private priceGift(
    amountNaira: number,
    unitPrice: number,
  ): { amountMinor: number; yards: Prisma.Decimal } {
    const amountMinor = MoneyUtil.toMinorUnits(amountNaira);
    const yards = new Prisma.Decimal(amountMinor)
      .div(unitPrice)
      .toDecimalPlaces(YARD_DECIMAL_PLACES);
    return { amountMinor, yards };
  }

  /** Previews the yard equivalent of an amount, before the supporter commits. */
  async quoteGift(
    slug: string,
    query: SupportQuoteQueryDto,
  ): Promise<SupportQuoteResponseDto> {
    const creator = await this.getGiftableCreator(slug);
    const material = await this.findGiftMaterial(
      creator.id,
      creator.themeMaterialId,
    );
    const { amountMinor, yards } = this.priceGift(query.amount, material.price);

    const materialName = material.displayName || material.material.name;
    return {
      amount: amountMinor,
      currency: material.currency,
      yards: yards.toNumber(),
      material: toContributionMaterial(
        material.materialId,
        materialName,
        material.material,
        yards.toNumber(),
      ),
      materialName,
    };
  }

  async createGuestIntent(
    slug: string,
    dto: CreateSupportIntentDto,
  ): Promise<SupportIntentResponseDto> {
    const creator = await this.getGiftableCreator(slug);
    const material = await this.findGiftMaterial(
      creator.id,
      creator.themeMaterialId,
    );
    const { amountMinor, yards } = this.priceGift(dto.amount, material.price);

    const { platformFeePercent: feePercentage } =
      await this.platformSettings.get();
    const { platformFee, creatorAmount } = MoneyUtil.calculateSplit(
      amountMinor,
      feePercentage,
    );
    const materialName = material.displayName || material.material.name;

    const support = await this.prisma.support.create({
      data: {
        guestName: dto.name?.trim() || null,
        guestEmail: dto.email?.trim().toLowerCase() || null,
        creatorId: creator.id,
        subtotal: amountMinor,
        platformFee,
        creatorAmount,
        totalAmount: amountMinor,
        currency: material.currency,
        message: dto.message?.trim() || null,
        isAnonymous: dto.isAnonymous ?? false,
        status: 'CREATED',
        items: {
          create: [
            {
              creatorMaterialId: material.id,
              materialNameSnapshot: materialName,
              unitPrice: material.price,
              quantity: yards,
              totalPrice: amountMinor,
              currency: material.currency,
            },
          ],
        },
      },
      select: { id: true },
    });

    return {
      supportId: support.id,
      amount: amountMinor,
      currency: material.currency,
      yards: yards.toNumber(),
      material: toContributionMaterial(
        material.materialId,
        materialName,
        material.material,
        yards.toNumber(),
      ),
      materialName,
      thankYouMessage: resolveThankYouMessage(creator.thankYouMessage),
    };
  }

  async getPublicWall(
    slug: string,
    query: SupportWallQueryDto,
  ): Promise<SupportWallResponseDto> {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, isPublished: true, showSupportersOnPage: true },
    });

    if (!creator || !creator.isPublished) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }

    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;

    if (!creator.showSupportersOnPage) {
      return {
        items: [],
        pagination: buildCursorPagination(limit, null),
        nextCursor: null,
        supporterCount: null,
      };
    }

    const cursor = query.cursor ? decodeWallCursor(query.cursor) : null;

    const received = {
      creatorId: creator.id,
      status: { in: RECEIVED_SUPPORT_STATUSES },
    };
    const [rows, supporterCount] = await Promise.all([
      this.prisma.support.findMany({
        where: { ...received, ...buildCursorWhere(cursor) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: SUPPORT_WALL_SELECT,
      }),
      this.prisma.support.count({ where: received }),
    ]);

    const { items, nextCursor } = toCursorPage(rows, limit, toSupportWallItem);
    return {
      items,
      pagination: buildCursorPagination(limit, nextCursor),
      nextCursor,
      supporterCount,
    };
  }
}
