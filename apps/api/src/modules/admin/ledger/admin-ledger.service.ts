import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MoneyUtil } from '../../../common/utils/money.util';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { buildPagination } from '../../../common/utils/pagination.util';
import { lagosDayEnd, lagosDayStart } from '../dto/admin-query.dto';
import { AdminLedgerQueryDto } from './admin-ledger.dto';

const SAMPLE = 20;

@Injectable()
export class AdminLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminLedgerQueryDto) {
    const where: Prisma.LedgerEntryWhereInput = {
      ...(query.entryType && { entryType: query.entryType }),
      ...(query.direction && { direction: query.direction }),
      ...(query.transactionId && { transactionId: query.transactionId }),
      ...((query.ownerType || query.creatorId) && {
        account: {
          ...(query.ownerType && { ownerType: query.ownerType }),
          ...(query.creatorId && { ownerId: query.creatorId }),
        },
      }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: lagosDayStart(query.from) }),
          ...(query.to && { lt: lagosDayEnd(query.to) }),
        },
      }),
    };
    const [total, items] = await Promise.all([
      this.prisma.ledgerEntry.count({ where }),
      this.prisma.ledgerEntry.findMany({
        where,
        include: {
          account: { select: { id: true, ownerType: true, ownerId: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: items.map((e) => MoneyUtil.toMajorDeep(e, ['amount'])),
      pagination: buildPagination(query.page, query.limit, total),
    };
  }

  /**
   * Cross-checks the ledger against payments, payouts and refunds. Every list
   * is capped at a sample; the counts are exact. All checks should be zero.
   */
  async reconciliation() {
    const [
      balances,
      negative,
      paidWithoutLedger,
      failedWithoutReversal,
      payoutsWithoutReservation,
      processedRefundsWithoutDebit,
      feeCheck,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        { ownerType: string; balance: bigint | null; accounts: bigint }[]
      >`
        SELECT a."ownerType", COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0) AS balance,
               COUNT(DISTINCT a.id) AS accounts
        FROM accounts a LEFT JOIN ledger_entries e ON e."accountId" = a.id
        GROUP BY a."ownerType"`,
      this.prisma.$queryRaw<{ ownerId: string; balance: bigint }[]>`
        SELECT a."ownerId", SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END) AS balance
        FROM accounts a JOIN ledger_entries e ON e."accountId" = a.id
        WHERE a."ownerType" = 'CREATOR'
        GROUP BY a."ownerId" HAVING SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END) < 0
        ORDER BY 2 ASC LIMIT ${SAMPLE}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT s.id FROM supports s JOIN payments p ON p."supportId" = s.id
        WHERE s.status IN ('PAID','COMPLETED','REFUNDED')
          AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = p.id AND e."entryType" = 'SUPPORT_PAYMENT')
        LIMIT ${SAMPLE}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM payouts p
        WHERE p.status IN ('FAILED','CANCELLED')
          AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = p.id AND e."entryType" = 'PAYOUT_REVERSED')
        LIMIT ${SAMPLE}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM payouts p
        WHERE NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = p.id AND e."entryType" = 'PAYOUT_RESERVATION')
        LIMIT ${SAMPLE}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT r.id FROM refunds r
        WHERE r.status IN ('PROCESSING','PROCESSED')
          AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = r.id AND e."entryType" = 'REFUND')
        LIMIT ${SAMPLE}`,
      this.prisma.$queryRaw<
        { expected: bigint | null; recorded: bigint | null }[]
      >`
        SELECT
          (SELECT COALESCE(SUM(s."platformFee"), 0) FROM supports s JOIN payments p ON p."supportId" = s.id
            WHERE s.status IN ('PAID','COMPLETED') AND EXISTS (SELECT 1 FROM ledger_entries e WHERE e."transactionId" = p.id)) AS expected,
          (SELECT COALESCE(SUM(e.amount), 0) FROM ledger_entries e
            JOIN supports s ON s.id = (SELECT "supportId" FROM payments WHERE id = e."transactionId")
            WHERE e."entryType" = 'PLATFORM_FEE' AND s.status IN ('PAID','COMPLETED')) AS recorded`,
    ]);

    const checks = {
      creatorAccountsBelowZero: negative.map((n) => ({
        creatorId: n.ownerId,
        balance: MoneyUtil.toMajorUnits(Number(n.balance)),
      })),
      paidContributionsWithoutLedger: paidWithoutLedger.map((r) => r.id),
      failedPayoutsWithoutReversal: failedWithoutReversal.map((r) => r.id),
      payoutsWithoutReservation: payoutsWithoutReservation.map((r) => r.id),
      refundsWithoutDebit: processedRefundsWithoutDebit.map((r) => r.id),
      platformFeeMismatch: {
        expected: MoneyUtil.toMajorUnits(Number(feeCheck[0]?.expected ?? 0)),
        recorded: MoneyUtil.toMajorUnits(Number(feeCheck[0]?.recorded ?? 0)),
      },
    };
    const feeOk =
      checks.platformFeeMismatch.expected ===
      checks.platformFeeMismatch.recorded;

    return {
      currency: 'NGN',
      balances: balances.map((b) => ({
        ownerType: b.ownerType,
        accounts: Number(b.accounts),
        balance: MoneyUtil.toMajorUnits(Number(b.balance ?? 0)),
      })),
      checks,
      healthy:
        checks.creatorAccountsBelowZero.length === 0 &&
        checks.paidContributionsWithoutLedger.length === 0 &&
        checks.failedPayoutsWithoutReversal.length === 0 &&
        checks.payoutsWithoutReservation.length === 0 &&
        checks.refundsWithoutDebit.length === 0 &&
        feeOk,
    };
  }
}
