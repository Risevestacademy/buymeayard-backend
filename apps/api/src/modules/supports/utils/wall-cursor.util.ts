import {Prisma} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { ErrorCodes } from '../../../common/errors/error-codes';

export interface WallCursor {
  createdAt: Date;
  id: string;
}

export function encodeWallCursor(row: WallCursor): string {
  const payload = { t: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeWallCursor(raw: string): WallCursor {
  try {
    const { t, id } = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const createdAt = new Date(t);
    if (typeof id !== 'string' || Number.isNaN(createdAt.getTime())) {
      throw new Error('malformed');
    }
    return { createdAt, id };
  } catch {
    throw new BadRequestException({
      code: ErrorCodes.VALIDATION_ERROR,
      message: 'Invalid cursor',
    });
  }
}

export function buildCursorWhere(cursor: WallCursor | null): Prisma.SupportWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export function toCursorPage<TRow extends WallCursor, TItem>(
  rows: TRow[],
  limit: number,
  mapRow: (row: TRow) => TItem,
): { items: TItem[]; nextCursor: string | null } {
  const hasMore = rows.length > limit; // we fetched limit + 1 rows
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    items: page.map(mapRow),
    nextCursor: hasMore && last ? encodeWallCursor(last) : null,
  };
}