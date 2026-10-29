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
  items: { select: { materialNameSnapshot: true }, take: 1 }, // single-material model
} satisfies Prisma.SupportSelect;

type SupportWallRow = Prisma.SupportGetPayload<{
  select: typeof SUPPORT_WALL_SELECT;
}>;

export function toSupportWallItem(row: SupportWallRow): SupportWallItemDto {
  return {
    displayName: resolveDisplayName(row),
    materialName: row.items[0]?.materialNameSnapshot ?? null,
    message: row.isAnonymous ? null : row.message || null,
    createdAt: row.createdAt,
  };
}
