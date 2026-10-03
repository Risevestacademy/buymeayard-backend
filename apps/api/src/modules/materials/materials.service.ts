import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateBasePriceDto } from './dto/update-base-price.dto';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MoneyUtil } from '../../common/utils/money.util';

const DEFAULT_PLATFORM_MATERIALS = [
  {
    name: 'Ankara',
    slug: 'ankara',
    description: 'Traditional African wax print fabric, widely worn at celebrations and everyday occasions.',
    thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/ankara-sm',
    thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/ankara-lg',
    color: '#7F3516', // Primary/700 - rich terracotta earth
  },
  {
    name: 'Adire',
    slug: 'adire',
    description: 'Hand-crafted indigo-dyed fabric with rich Yoruba heritage and bold resist-dye patterns.',
    thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/adire-sm',
    thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/adire-lg',
    color: '#4A2E8A', // Secondary - Amethyst/600 - deep indigo purple
  },
  {
    name: 'Ochafu',
    slug: 'ochafu',
    description: 'Classic traditional woven textile fabric from eastern Nigeria, used for ceremonies and royalty.',
    thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/ochafu-sm',
    thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/ochafu-lg',
    color: '#54230E', // Primary/800 - deep royal umber
  },
  {
    name: 'Aso-Oke',
    slug: 'aso-oke',
    description: 'Hand-woven prestige cloth from the Yoruba people of Nigeria, synonymous with celebration.',
    thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/aso-oke-sm',
    thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/aso-oke-lg',
    color: '#AB491F', // Primary/600 - warm rust orange
  },
  {
    name: 'Akwete',
    slug: 'akwete',
    description: 'Distinctive hand-woven textile from Akwete, Abia State — known for its bold geometric designs.',
    thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/akwete-sm',
    thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/akwete-lg',
    color: '#676670', // Neutral/500 - elegant graphite slate
  },
  {
    name: 'Lace',
    slug: 'lace',
    description: 'Intricate and elegant luxury lace fabric, a staple for Nigerian celebrations and ceremonies.',
    thumbnailSmallUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_80,h_80,c_fill,q_auto,f_auto/materials/lace-sm',
    thumbnailLargeUrl: 'https://res.cloudinary.com/buymeayard/image/upload/w_400,h_400,c_fill,q_auto,f_auto/materials/lace-lg',
    color: '#CAA8F5', // Secondary - Amethyst/300 - soft lilac lavender
  },
];

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllCatalogue(all = false) {
    const where: any = { creatorId: null };
    if (!all) {
      where.status = 'ACTIVE';
    }
    const materials = await this.prisma.material.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    if (materials.length === 0 && !all) {
      return this.ensureDefaultCatalogue(100000, 'NGN');
    }

    return materials;
  }

  async findByIdOrSlug(idOrSlug: string) {
    const material = await this.prisma.material.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug.toLowerCase().trim() }],
      },
    });
    if (!material) {
      throw new NotFoundException(`Material "${idOrSlug}" not found`);
    }
    return material;
  }

  async findCatalogueBySlug(slug: string) {
    return this.findByIdOrSlug(slug);
  }

  async createMaterial(dto: CreateMaterialDto) {
    const cleanSlug = (dto.slug || dto.name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existing = await this.prisma.material.findUnique({
      where: { slug: cleanSlug },
    });
    if (existing) {
      throw new ConflictException(
        `Material with slug "${cleanSlug}" already exists`,
      );
    }

    const basePriceInfo = await this.getBasePrice();

    return this.prisma.material.create({
      data: {
        name: dto.name.trim(),
        slug: cleanSlug,
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        thumbnailSmallUrl: dto.thumbnailSmallUrl?.trim() || null,
        thumbnailLargeUrl: dto.thumbnailLargeUrl?.trim() || null,
        color: dto.color?.trim() || null,
        defaultPrice: basePriceInfo.basePriceMinor,
        currency: basePriceInfo.currency,
        status: 'ACTIVE',
      },
    });
  }

  async updateMaterial(id: string, dto: UpdateMaterialDto) {
    const material = await this.prisma.material.findUnique({
      where: { id },
    });
    if (!material) {
      throw new NotFoundException(`Material with id "${id}" not found`);
    }

    let finalSlug = material.slug;
    if (dto.slug || (dto.name && !material.slug)) {
      finalSlug = (dto.slug || dto.name!)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      if (finalSlug !== material.slug) {
        const existing = await this.prisma.material.findUnique({
          where: { slug: finalSlug },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            `Material with slug "${finalSlug}" already exists`,
          );
        }
      }
    }

    return this.prisma.material.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        slug: finalSlug,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : undefined,
        imageUrl:
          dto.imageUrl !== undefined ? dto.imageUrl?.trim() || null : undefined,
        thumbnailSmallUrl:
          dto.thumbnailSmallUrl !== undefined
            ? dto.thumbnailSmallUrl?.trim() || null
            : undefined,
        thumbnailLargeUrl:
          dto.thumbnailLargeUrl !== undefined
            ? dto.thumbnailLargeUrl?.trim() || null
            : undefined,
        color:
          dto.color !== undefined ? dto.color?.trim() || null : undefined,
        status: dto.status !== undefined ? dto.status : undefined,
      },
    });
  }

  async deleteMaterial(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: {
        creatorMaterials: {
          include: {
            supportItems: { take: 1 },
          },
        },
      },
    });

    if (!material) {
      throw new NotFoundException(`Material with id "${id}" not found`);
    }

    const hasSupports = material.creatorMaterials.some(
      (cm) => cm.supportItems && cm.supportItems.length > 0,
    );

    if (hasSupports) {
      await this.prisma.material.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
      return {
        success: true,
        message:
          'Material deactivated (soft-deleted) as it has historical support records',
        materialId: id,
        status: 'INACTIVE',
      };
    }

    await this.prisma.material.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Material deleted successfully',
      materialId: id,
    };
  }

  async getBasePrice() {
    let materials = await this.prisma.material.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    if (materials.length === 0) {
      materials = await this.ensureDefaultCatalogue(100000, 'NGN');
    }

    const primary = materials[0];
    const defaultMinor = primary ? primary.defaultPrice : 100000;
    const currency = primary ? primary.currency : 'NGN';

    return {
      basePrice: MoneyUtil.toMajorUnits(defaultMinor),
      basePriceMinor: defaultMinor,
      currency,
      materials: materials.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        price: MoneyUtil.toMajorUnits(m.defaultPrice),
        priceMinor: m.defaultPrice,
      })),
    };
  }

  async updateBasePrice(dto: UpdateBasePriceDto) {
    // If admin enters 1000 (NGN), minor is 100,000. If already >= 10,000, treat as minor units.
    const priceMinor =
      dto.price >= 10000
        ? Math.round(dto.price)
        : MoneyUtil.toMinorUnits(dto.price);
    const currency = dto.currency || 'NGN';

    const updateResult = await this.prisma.material.updateMany({
      where: { status: 'ACTIVE' },
      data: {
        defaultPrice: priceMinor,
        currency,
      },
    });

    if (updateResult.count === 0) {
      await this.ensureDefaultCatalogue(priceMinor, currency);
    }

    let updatedCreatorMaterialsCount = 0;
    if (dto.updateCreatorMaterials) {
      const cmResult = await this.prisma.creatorMaterial.updateMany({
        where: { status: 'ACTIVE' },
        data: {
          price: priceMinor,
          currency,
        },
      });
      updatedCreatorMaterialsCount = cmResult.count;
    }

    return {
      success: true,
      message: 'Universal platform yard base price updated successfully',
      basePrice: MoneyUtil.toMajorUnits(priceMinor),
      basePriceMinor: priceMinor,
      currency,
      updatedPlatformMaterialsCount: Math.max(
        updateResult.count,
        DEFAULT_PLATFORM_MATERIALS.length,
      ),
      updatedCreatorMaterialsCount,
    };
  }

  async calculate(amount?: number, yards?: number) {
    const basePriceInfo = await this.getBasePrice();
    const basePricePerYard = basePriceInfo.basePrice;
    const basePriceMinor = basePriceInfo.basePriceMinor;
    const currency = basePriceInfo.currency;

    if (amount !== undefined && !isNaN(amount) && amount > 0) {
      const calculatedYards = Math.floor(amount / basePricePerYard);
      const effectiveAmount = calculatedYards * basePricePerYard;
      const remainder = amount - effectiveAmount;

      return {
        basePricePerYard,
        basePriceMinor,
        currency,
        inputAmount: amount,
        calculatedYards,
        effectiveAmount,
        effectiveAmountMinor: MoneyUtil.toMinorUnits(effectiveAmount),
        remainder,
        summary: `${amount.toLocaleString()} ${currency} gifts ${calculatedYards} yard${calculatedYards === 1 ? '' : 's'} of material at ${basePricePerYard.toLocaleString()} ${currency} per yard.`,
      };
    }

    const yardQty =
      yards !== undefined && !isNaN(yards) && yards > 0
        ? Math.round(yards)
        : 1;
    const totalAmount = yardQty * basePricePerYard;
    const totalAmountMinor = yardQty * basePriceMinor;

    return {
      basePricePerYard,
      basePriceMinor,
      currency,
      yards: yardQty,
      totalAmount,
      totalAmountMinor,
      summary: `${yardQty} yard${yardQty === 1 ? '' : 's'} of material equals ${totalAmount.toLocaleString()} ${currency} at ${basePricePerYard.toLocaleString()} ${currency} per yard.`,
    };
  }

  private async ensureDefaultCatalogue(priceMinor: number, currency: string) {
    const created: any[] = [];
    for (const m of DEFAULT_PLATFORM_MATERIALS) {
      const item = await this.prisma.material.upsert({
        where: { slug: m.slug },
        update: {
          defaultPrice: priceMinor,
          currency,
          description: m.description,
          thumbnailSmallUrl: m.thumbnailSmallUrl,
          thumbnailLargeUrl: m.thumbnailLargeUrl,
          color: m.color,
        },
        create: {
          name: m.name,
          slug: m.slug,
          description: m.description,
          thumbnailSmallUrl: m.thumbnailSmallUrl,
          thumbnailLargeUrl: m.thumbnailLargeUrl,
          color: m.color,
          defaultPrice: priceMinor,
          currency,
          status: 'ACTIVE',
        },
      });
      created.push(item);
    }
    return created;
  }
}
