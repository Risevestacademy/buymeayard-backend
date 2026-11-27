import { Prisma } from '@prisma/client';
import { SupportWallItemDto } from '../dto/support-wall.dto';
import { toContributionMaterial } from './contribution-material.mapper';
import {
  resolveDisplayName,
  wallMessage,
} from '../utils/support-visibility.util';

// The query selects ONLY these columns, so fee and payment data never leave the database.
export const SUPPORT_WALL_SELECT = {
  id: true,
  createdAt: true,
  guestName: true,
  message: true,
  visibility: true,
  totalAmount: true,
  chargeAmount: true,
  chargeCurrency: true,
  items: {
    select: {
      materialNameSnapshot: true,
      quantity: true,
      creatorMaterial: {
        select: {
          materialId: true,
          customThumbnailUrl: true,
          material: {
            select: {
              color: true,
              thumbnailLargeUrl: true,
              thumbnailSmallUrl: true,
            },
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
  // Same shape as the creator dashboard's contribution `material`
  const material = item
    ? toContributionMaterial(
        item.creatorMaterial.materialId,
        item.materialNameSnapshot,
        item.creatorMaterial.material,
        item.quantity.toNumber(),
        item.creatorMaterial.customThumbnailUrl,
      )
    : null;

  return {
    id: row.id,
    displayName: resolveDisplayName(row),
    material,
    materialId: material?.id ?? null,
    materialName: material?.name ?? null,
    message: wallMessage(row),
    amount: row.totalAmount,
    currency: 'NGN',
    paidAmount: row.chargeAmount ?? row.totalAmount,
    paidCurrency: row.chargeCurrency,
    createdAt: row.createdAt,
  };
}
