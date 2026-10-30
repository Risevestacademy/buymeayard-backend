import { Prisma } from '@prisma/client';
import { SupportWallItemDto } from '../dto/support-wall.dto';
import { resolveDisplayName } from '../utils/support-visibility.util';

// The query selects ONLY these columns, so fee and payment data never leave the database.
export const SUPPORT_WALL_SELECT = {
  id: true,
  createdAt: true,
  guestName: true,
  message: true,
  isAnonymous: true,
  items: {
    select: {
      materialNameSnapshot: true,
      quantity: true,
      creatorMaterial: {
        select: {
          materialId: true,
          material: {
            select: { color: true, thumbnailSmallUrl: true, imageUrl: true },
          },
        },
      },
    },
    take: 1, // single-material model
  },
} satisfies Prisma.SupportSelect;

type SupportWallRow = Prisma.SupportGetPayload<{
  select: typeof SUPPORT_WALL_SELECT;
}>;

export function toSupportWallItem(row: SupportWallRow): SupportWallItemDto {
  const item = row.items[0];
  const platformMaterial = item?.creatorMaterial.material;
  // Same shape as the creator dashboard's contribution `material`
  const material = item
    ? {
        id: item.creatorMaterial.materialId,
        name: item.materialNameSnapshot,
        color: platformMaterial?.color || null,
        thumbnailUrl:
          platformMaterial?.thumbnailSmallUrl ||
          platformMaterial?.imageUrl ||
          null,
        quantity: item.quantity.toNumber(),
      }
    : null;

  return {
    id: row.id,
    displayName: resolveDisplayName(row),
    material,
    materialId: material?.id ?? null,
    materialName: material?.name ?? null,
    message: row.isAnonymous ? null : row.message || null,
    createdAt: row.createdAt,
  };
}
