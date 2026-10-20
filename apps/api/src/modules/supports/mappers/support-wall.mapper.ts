import { Prisma } from '@prisma/client';
import { SupportWallItemDto } from '../dto/support-wall.dto';
import { resolveDisplayName } from '../utils/support-visibility.util';
//const ANONYMOUS_LABEL = 'Anonymous';

// The query selects ONLY these columns, so fee and payment data never leave the database.
export const SUPPORT_WALL_SELECT = {
  id: true,
  createdAt: true,
  guestName: true,
  message: true,
  isAnonymous: true,
  supporter: { select: { name: true } },
  items: { select: { materialNameSnapshot: true }, take: 1 }, // single-material model
} satisfies Prisma.SupportSelect;

type SupportWallRow = Prisma.SupportGetPayload<{
  select: typeof SUPPORT_WALL_SELECT;
}>;

// function resolveDisplayName(row: SupportWallRow): string {
//   if (row.isAnonymous) return ANONYMOUS_LABEL;
//   const name = (row.guestName || row.supporter?.name)?.trim();
//   return name || ANONYMOUS_LABEL;
// }

export function toSupportWallItem(row: SupportWallRow): SupportWallItemDto {
  return {
    displayName: resolveDisplayName(row),
    materialName: row.items[0]?.materialNameSnapshot ?? null,
    message: row.isAnonymous ? null : row.message || null,
    createdAt: row.createdAt,
  };
}
