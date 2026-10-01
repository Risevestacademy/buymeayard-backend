import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateBasePriceDto } from './dto/update-base-price.dto';
import { MoneyUtil } from '../../common/utils/money.util';

const DEFAULT_PLATFORM_MATERIALS = [
  {
    name: 'Ankara',
    slug: 'ankara',
    description: 'Traditional vibrant African wax print fabric',
  },
  {
    name: 'Lace',
    slug: 'lace',
    description: 'Intricate and elegant luxury lace fabric',
  },
  {
    name: 'Aso-Oke',
    slug: 'aso-oke',
    description: 'Hand-woven prestige cloth from Nigeria',
  },
  {
    name: 'Adire',
    slug: 'adire',
    description: 'Indigo-dyed patterned fabric from Nigeria',
  },
];

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllCatalogue() {
    const materials = await this.prisma.material.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });

    if (materials.length === 0) {
      return this.ensureDefaultCatalogue(100000, 'NGN');
    }

    return materials;
  }

  async findCatalogueBySlug(slug: string) {
    const material = await this.prisma.material.findUnique({
      where: { slug },
    });
    if (!material) {
      throw new NotFoundException(`Material with slug ${slug} not found`);
    }
    return material;
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

  private async ensureDefaultCatalogue(priceMinor: number, currency: string) {
    const created: any[] = [];
    for (const m of DEFAULT_PLATFORM_MATERIALS) {
      const item = await this.prisma.material.upsert({
        where: { slug: m.slug },
        update: { defaultPrice: priceMinor, currency },
        create: {
          name: m.name,
          slug: m.slug,
          description: m.description,
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
