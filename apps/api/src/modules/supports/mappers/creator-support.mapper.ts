import { Prisma } from '@prisma/client';
import { CreatorSupportItemDto } from '../dto/creator-support.dto';
import { resolveDisplayName } from '../utils/support-visibility.util';

export const CREATOR_SUPPORT_SELECT = {
  id: true,
  createdAt: true,
  guestName: true,
  message: true,
  isAnonymous: true,
  totalAmount: true,
  creatorAmount: true,
  supporter: { select: { name: true } },
  items: {
    take: 1, // single-material model
    select: {
      materialNameSnapshot: true,
      creatorMaterial: {
        select: {
          material: { select: { thumbnailSmallUrl: true, imageUrl: true } },
        },
      },
    },
  },
} satisfies Prisma.SupportSelect;

type CreatorSupportRow = Prisma.SupportGetPayload<{
  select: typeof CREATOR_SUPPORT_SELECT;
}>;

export function toCreatorSupportItem(
  row: CreatorSupportRow,
): CreatorSupportItemDto {
  const item = row.items[0];
  const material = item?.creatorMaterial.material;

  return {
    id: row.id,
    displayName: resolveDisplayName(row),
    materialName: item?.materialNameSnapshot ?? null,
    materialThumbnailUrl:
      material?.thumbnailSmallUrl ?? material?.imageUrl ?? null,
    // The message is addressed to the creator, so they always see it.
    message: row.message || null,
    amount: row.totalAmount,
    netAmount: row.creatorAmount,
    createdAt: row.createdAt,
  };
}
