import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { buildPagination } from '../../../common/utils/pagination.util';
import { MoneyUtil } from '../../../common/utils/money.util';
import { AuditLogService } from '../../analytics/audit-log.service';
import { MaterialsService } from '../../materials/materials.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../../../infrastructure/storage/storage-provider.interface';
import {
  AdminCreateMaterialDto,
  AdminMaterialsQueryDto,
  AdminUpdateMaterialDto,
} from './admin-materials.dto';

const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const OWNER_SELECT = {
  id: true,
  slug: true,
  creatorName: true,
  isPublished: true,
} satisfies Prisma.CreatorProfileSelect;

@Injectable()
export class AdminMaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly materialsService: MaterialsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Stores a material image and returns its URL. Nothing is saved on a material yet. */
  async uploadThumbnail(file: Express.Multer.File) {
    const result = await this.storage.uploadFile(file.buffer, {
      folder: 'materials',
      resourceType: 'image',
    });
    return { url: result.secureUrl };
  }

  async create(adminId: string, dto: AdminCreateMaterialDto) {
    const slug = slugify(dto.slug || dto.name);
    if (!slug) throw new BadRequestException('Slug cannot be empty');
    await this.assertSlugFree(slug);

    if (dto.creatorId) {
      const owner = await this.prisma.creatorProfile.findUnique({
        where: { id: dto.creatorId },
        select: { id: true },
      });
      if (!owner) throw new NotFoundException('Creator not found');
    }

    const base = await this.materialsService.getBasePrice();
    const created = await this.prisma.material.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description || null,
        imageUrl: dto.imageUrl || null,
        thumbnailSmallUrl: dto.thumbnailSmallUrl || null,
        thumbnailLargeUrl: dto.thumbnailLargeUrl || null,
        color: dto.color || null,
        defaultPrice:
          dto.defaultPrice !== undefined
            ? MoneyUtil.toMinorUnits(dto.defaultPrice)
            : base.basePriceMinor,
        currency: base.currency,
        status: dto.status ?? 'ACTIVE',
        creatorId: dto.creatorId ?? null,
      },
    });

    await this.audit.record({
      actorId: adminId,
      action: 'admin.material.created',
      resourceType: 'Material',
      resourceId: created.id,
      newState: { name: created.name, slug, status: created.status },
    });
    return this.get(created.id);
  }

  async update(id: string, adminId: string, dto: AdminUpdateMaterialDto) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');

    let slug: string | undefined;
    if (dto.slug !== undefined || dto.name !== undefined) {
      if (dto.slug !== undefined) {
        slug = slugify(dto.slug);
        if (!slug) throw new BadRequestException('Slug cannot be empty');
      }
      if (slug && slug !== material.slug) await this.assertSlugFree(slug, id);
      if (slug === material.slug) slug = undefined;
    }

    const empty = (v?: string) => (v === undefined ? undefined : v || null);
    const updated = await this.prisma.material.update({
      where: { id },
      data: {
        name: dto.name,
        slug,
        description: empty(dto.description),
        imageUrl: empty(dto.imageUrl),
        thumbnailSmallUrl: empty(dto.thumbnailSmallUrl),
        thumbnailLargeUrl: empty(dto.thumbnailLargeUrl),
        color: empty(dto.color),
        status: dto.status,
        defaultPrice:
          dto.defaultPrice !== undefined
            ? MoneyUtil.toMinorUnits(dto.defaultPrice)
            : undefined,
      },
    });

    await this.audit.record({
      actorId: adminId,
      action: 'admin.material.updated',
      resourceType: 'Material',
      resourceId: id,
      previousState: {
        name: material.name,
        slug: material.slug,
        status: material.status,
        defaultPrice: material.defaultPrice,
      },
      newState: {
        name: updated.name,
        slug: updated.slug,
        status: updated.status,
        defaultPrice: updated.defaultPrice,
      },
    });
    return this.get(id);
  }

  /** Hard-deletes, unless the material has support history: then deactivates. */
  async remove(id: string, adminId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });
    if (!material) throw new NotFoundException('Material not found');

    const used = await this.prisma.supportItem.findFirst({
      where: { creatorMaterial: { materialId: id } },
      select: { id: true },
    });

    if (used) {
      await this.prisma.material.update({
        where: { id },
        data: { status: 'INACTIVE' },
      });
    } else {
      await this.prisma.material.delete({ where: { id } });
    }

    await this.audit.record({
      actorId: adminId,
      action: used ? 'admin.material.deactivated' : 'admin.material.deleted',
      resourceType: 'Material',
      resourceId: id,
      previousState: { name: material.name, status: material.status },
    });
    return {
      success: true,
      materialId: id,
      deleted: !used,
      status: used ? 'INACTIVE' : null,
      message: used
        ? 'Material has support history, so it was deactivated instead of deleted'
        : 'Material deleted',
    };
  }

  private async assertSlugFree(slug: string, exceptId?: string) {
    const clash = await this.prisma.material.findUnique({ where: { slug } });
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(
        `Material with slug "${slug}" already exists`,
      );
    }
  }

  async list(query: AdminMaterialsQueryDto) {
    const where: Prisma.MaterialWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.source === 'PLATFORM' && { creatorId: null }),
      ...(query.source === 'CREATOR' && { creatorId: { not: null } }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const sort = query.sort ?? 'recently_updated';
    const orderBy: Prisma.MaterialOrderByWithRelationInput[] = [
      sort === 'name'
        ? { name: 'asc' }
        : sort === 'newest'
          ? { createdAt: 'desc' }
          : sort === 'oldest'
            ? { createdAt: 'asc' }
            : { updatedAt: 'desc' },
      { id: 'desc' },
    ];

    const [total, materials, summary] = await Promise.all([
      this.prisma.material.count({ where }),
      this.prisma.material.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { creator: { select: OWNER_SELECT } },
      }),
      this.summary(),
    ]);

    const visible = await this.visibleCounts(materials.map((m) => m.id));

    return {
      summary,
      items: materials.map((m) => this.toItem(m, visible.get(m.id))),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  async get(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: {
        creator: { select: OWNER_SELECT },
        creatorMaterials: {
          orderBy: { updatedAt: 'desc' },
          include: { creator: { select: OWNER_SELECT } },
        },
      },
    });
    if (!material) throw new NotFoundException('Material not found');

    const { creatorMaterials, ...rest } = material;
    const visible = await this.visibleCounts([id]);
    return {
      ...this.toItem(rest, visible.get(id)),
      creators: creatorMaterials.map((cm) => ({
        creatorMaterialId: cm.id,
        creator: cm.creator,
        price: MoneyUtil.toMajorUnits(cm.price),
        currency: cm.currency,
        displayName: cm.displayName,
        description: cm.description,
        status: cm.status,
        visibleOnPage:
          cm.status === 'ACTIVE' &&
          cm.creator.isPublished &&
          material.status === 'ACTIVE',
        updatedAt: cm.updatedAt,
      })),
    };
  }

  /** Totals across all materials, independent of list filters. */
  private async summary() {
    const [total, active, platform, latest] = await Promise.all([
      this.prisma.material.count(),
      this.prisma.material.count({ where: { status: 'ACTIVE' } }),
      this.prisma.material.count({ where: { creatorId: null } }),
      this.prisma.material.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);
    return {
      totalMaterials: total,
      active,
      inactive: total - active,
      platformMaterials: platform,
      creatorMaterials: total - platform,
      lastUpdatedAt: latest?.updatedAt ?? null,
    };
  }

  /**
   * Per material, how many creator pages show it: an ACTIVE creator-material
   * link on a published creator page, for an ACTIVE material.
   */
  private async visibleCounts(ids: string[]) {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await this.prisma.creatorMaterial.groupBy({
      by: ['materialId'],
      where: {
        materialId: { in: ids },
        status: 'ACTIVE',
        creator: { isPublished: true },
        material: { status: 'ACTIVE' },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.materialId, r._count._all]));
  }

  private toItem<
    M extends {
      defaultPrice: number;
      creatorId: string | null;
    },
  >(material: M, visibleOnCreatorPages = 0) {
    return {
      ...material,
      defaultPrice: MoneyUtil.toMajorUnits(material.defaultPrice),
      source: material.creatorId ? 'CREATOR' : 'PLATFORM',
      visibleOnCreatorPages,
    };
  }
}
