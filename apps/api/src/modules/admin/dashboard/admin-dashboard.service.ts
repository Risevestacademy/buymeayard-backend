import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MoneyUtil } from '../../../common/utils/money.util';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { IN_FLIGHT_PAYOUT_STATUSES } from '../../payouts/payouts.service';
import { lagosDay, lagosDayEnd, lagosDayStart } from '../dto/admin-query.dto';
import { AdminSummaryQueryDto } from './admin-dashboard.dto';

const PAID = ['PAID', 'COMPLETED'];
/** A payout still in flight after this long is "late". */
const LATE_AFTER_MS = 48 * 3600 * 1000;
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 3600 * 1000;
const QUEUE_PREVIEW = 4;
const RECENT_CREATORS = 5;

type DayRow = { day: string; value: bigint | number | null };

const toNairaPoint = (p: { day: string; value: number }) => ({
  day: p.day,
  value: MoneyUtil.toMajorUnits(p.value),
});

/** Value with its change against the previous period of the same length. */
function withChange(current: number, previous: number, naira = false) {
  const out = (n: number) => (naira ? MoneyUtil.toMajorUnits(n) : n);
  return {
    value: out(current),
    previous: out(previous),
    changePercent:
      previous === 0
        ? null
        : Math.round(((current - previous) / previous) * 1000) / 10,
  };
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything the admin Overview screen shows, in one call. Money is in
   * naira; days and weeks are in Lagos time.
   */
  async getSummary(adminId: string, query: AdminSummaryQueryDto) {
    const now = new Date();
    const today = lagosDay(now);
    const toDay = query.to ?? today;
    const fromDay = query.from ?? `${today.slice(0, 8)}01`;
    const from = lagosDayStart(fromDay);
    const to = lagosDayEnd(toDay);
    if (
      !(from < to) ||
      (to.getTime() - from.getTime()) / DAY_MS > MAX_RANGE_DAYS
    ) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: `from must be before to, within ${MAX_RANGE_DAYS} days`,
      });
    }
    const span = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - span);
    const midnight = lagosDayStart(today);

    const [
      admin,
      newToday,
      creatorTotals,
      contribution,
      pending,
      paidOut,
      weekly,
      queue,
      recentCreators,
      creatorSeries,
      contributionSeries,
      pendingSeries,
      paidSeries,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: adminId },
        select: { name: true },
      }),
      this.prisma.support.count({
        where: { status: { in: PAID }, createdAt: { gte: midnight } },
      }),
      this.creatorTotals(from, to),
      this.contributionStats(from, to, prevFrom),
      this.pendingStats(),
      this.paidOutStats(),
      this.weeklyVolume(query.weeks, now),
      this.payoutQueue(now),
      this.recentCreators(),
      this.dailySeries(
        Prisma.sql`SELECT d AS day, COUNT(*) AS value FROM (SELECT ${lagosDaySql('"createdAt"')} AS d FROM creator_profiles WHERE "createdAt" >= ${from} AND "createdAt" < ${to}) t GROUP BY d`,
        fromDay,
        toDay,
      ),
      this.dailySeries(
        Prisma.sql`SELECT d AS day, SUM(a) AS value FROM (SELECT ${lagosDaySql('"createdAt"')} AS d, "totalAmount" AS a FROM supports WHERE status IN ('PAID','COMPLETED') AND "createdAt" >= ${from} AND "createdAt" < ${to}) t GROUP BY d`,
        fromDay,
        toDay,
      ),
      this.dailySeries(
        Prisma.sql`SELECT d AS day, COUNT(*) AS value FROM (SELECT ${lagosDaySql('"requestedAt"')} AS d FROM payouts WHERE "requestedAt" >= ${from} AND "requestedAt" < ${to}) t GROUP BY d`,
        fromDay,
        toDay,
      ),
      this.dailySeries(
        Prisma.sql`SELECT d AS day, SUM(a) AS value FROM (SELECT ${lagosDaySql('"processedAt"')} AS d, "netAmount" AS a FROM payouts WHERE status = 'SUCCESS' AND "processedAt" >= ${from} AND "processedAt" < ${to}) t GROUP BY d`,
        fromDay,
        toDay,
      ),
    ]);

    return {
      greeting: {
        adminName: admin?.name ?? null,
        date: today,
        newContributionsToday: newToday,
      },
      range: { from: fromDay, to: toDay },
      currency: 'NGN',
      kpis: {
        totalCreators: {
          value: creatorTotals.total,
          newInRange: creatorTotals.newInRange,
          series: creatorSeries,
        },
        contributionsReceived: {
          ...withChange(
            contribution.current.sum,
            contribution.previous.sum,
            true,
          ),
          count: contribution.current.count,
          series: contributionSeries.map(toNairaPoint),
        },
        pendingPayouts: {
          count: pending.count,
          amount: MoneyUtil.toMajorUnits(pending.amount),
          lateCount: pending.lateCount,
          lateAfterHours: LATE_AFTER_MS / 3600 / 1000,
          series: pendingSeries,
        },
        paidOutToDate: {
          amount: MoneyUtil.toMajorUnits(paidOut.amount),
          paidOnTimePercent: paidOut.onTimePercent,
          series: paidSeries.map(toNairaPoint),
        },
      },
      contributionVolume: {
        weekly: weekly.weeks.map((w) => ({
          weekStart: w.weekStart,
          contributions: MoneyUtil.toMajorUnits(w.contributions),
          payouts: MoneyUtil.toMajorUnits(w.payouts),
        })),
        thisWeek: withChange(weekly.thisWeek, weekly.lastWeek, true),
        averageContribution: withChange(
          contribution.current.average,
          contribution.previous.average,
          true,
        ),
        uniqueSupporters: withChange(
          contribution.current.supporters,
          contribution.previous.supporters,
        ),
      },
      payoutQueue: queue,
      recentCreators,
    };
  }

  private async creatorTotals(from: Date, to: Date) {
    const [total, newInRange] = await Promise.all([
      this.prisma.creatorProfile.count(),
      this.prisma.creatorProfile.count({
        where: { createdAt: { gte: from, lt: to } },
      }),
    ]);
    return { total, newInRange };
  }

  private async contributionStats(from: Date, to: Date, prevFrom: Date) {
    const stats = async (gte: Date, lt: Date) => {
      const [agg, supporters] = await Promise.all([
        this.prisma.support.aggregate({
          where: { status: { in: PAID }, createdAt: { gte, lt } },
          _sum: { totalAmount: true },
          _count: true,
        }),
        this.prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(DISTINCT COALESCE(lower("guestEmail"), id)) AS n
          FROM supports
          WHERE status IN ('PAID','COMPLETED') AND "createdAt" >= ${gte} AND "createdAt" < ${lt}`,
      ]);
      const sum = agg._sum.totalAmount ?? 0;
      return {
        sum,
        count: agg._count,
        average: agg._count ? Math.round(sum / agg._count) : 0,
        supporters: Number(supporters[0]?.n ?? 0),
      };
    };
    const [current, previous] = await Promise.all([
      stats(from, to),
      stats(prevFrom, from),
    ]);
    return { current, previous };
  }

  private async pendingStats() {
    const where = { status: { in: IN_FLIGHT_PAYOUT_STATUSES } };
    const [agg, lateCount] = await Promise.all([
      this.prisma.payout.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payout.count({
        where: {
          ...where,
          requestedAt: { lt: new Date(Date.now() - LATE_AFTER_MS) },
        },
      }),
    ]);
    return {
      count: agg._count,
      amount: agg._sum.amount ?? 0,
      lateCount,
    };
  }

  /** "Paid on time": settled payouts that reached SUCCESS within the late window. */
  private async paidOutStats() {
    const [agg, rows] = await Promise.all([
      this.prisma.payout.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { netAmount: true },
        _count: true,
      }),
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM payouts
        WHERE status = 'SUCCESS' AND "processedAt" - "requestedAt" <= ${`${LATE_AFTER_MS / 1000} seconds`}::interval`,
    ]);
    const onTime = Number(rows[0]?.n ?? 0);
    return {
      amount: agg._sum.netAmount ?? 0,
      onTimePercent: agg._count
        ? Math.round((onTime / agg._count) * 1000) / 10
        : null,
    };
  }

  private async weeklyVolume(weeks: number, now: Date) {
    const rows = await this.prisma.$queryRaw<
      { week: string; contributions: bigint | null; payouts: bigint | null }[]
    >`
      WITH w AS (
        SELECT to_char(generate_series(
          date_trunc('week', (${now}::timestamptz AT TIME ZONE 'Africa/Lagos')) - ((${weeks}::int - 1) * interval '1 week'),
          date_trunc('week', (${now}::timestamptz AT TIME ZONE 'Africa/Lagos')),
          interval '1 week'), 'YYYY-MM-DD') AS week
      )
      SELECT w.week,
        (SELECT SUM("totalAmount") FROM supports s
          WHERE s.status IN ('PAID','COMPLETED')
          AND to_char(date_trunc('week', (s."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM-DD') = w.week) AS contributions,
        (SELECT SUM("netAmount") FROM payouts p
          WHERE p.status = 'SUCCESS'
          AND to_char(date_trunc('week', (p."processedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM-DD') = w.week) AS payouts
      FROM w ORDER BY w.week`;
    const list = rows.map((r) => ({
      weekStart: r.week,
      contributions: Number(r.contributions ?? 0),
      payouts: Number(r.payouts ?? 0),
    }));
    const last = list[list.length - 1];
    const before = list[list.length - 2];
    return {
      weeks: list,
      thisWeek: last?.contributions ?? 0,
      lastWeek: before?.contributions ?? 0,
    };
  }

  private async payoutQueue(now: Date) {
    const where = { status: { in: IN_FLIGHT_PAYOUT_STATUSES } };
    const [agg, items] = await Promise.all([
      this.prisma.payout.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payout.findMany({
        where,
        orderBy: { requestedAt: 'asc' },
        take: QUEUE_PREVIEW,
        include: {
          creator: {
            select: {
              id: true,
              slug: true,
              creatorName: true,
              avatarUrl: true,
            },
          },
        },
      }),
    ]);
    return {
      count: agg._count,
      totalAmount: MoneyUtil.toMajorUnits(agg._sum.amount ?? 0),
      items: items.map((p) => {
        const ageMs = now.getTime() - p.requestedAt.getTime();
        return {
          id: p.id,
          reference: p.reference,
          status: p.status,
          amount: MoneyUtil.toMajorUnits(p.amount),
          netAmount: MoneyUtil.toMajorUnits(p.netAmount),
          bankName: p.bankName,
          accountNumberLast4: p.accountNumberLast4,
          requestedAt: p.requestedAt,
          ageHours: Math.floor(ageMs / 3600 / 1000),
          isLate: ageMs > LATE_AFTER_MS,
          creator: p.creator,
        };
      }),
    };
  }

  private async recentCreators() {
    const [total, creators] = await Promise.all([
      this.prisma.creatorProfile.count(),
      this.prisma.creatorProfile.findMany({
        orderBy: { createdAt: 'desc' },
        take: RECENT_CREATORS,
        select: {
          id: true,
          slug: true,
          creatorName: true,
          avatarUrl: true,
          status: true,
          kycStatus: true,
          createdAt: true,
        },
      }),
    ]);
    const totals = await this.prisma.support.groupBy({
      by: ['creatorId'],
      where: {
        creatorId: { in: creators.map((c) => c.id) },
        status: { in: PAID },
      },
      _sum: { totalAmount: true },
    });
    const contributed = new Map(
      totals.map((t) => [t.creatorId, t._sum.totalAmount ?? 0]),
    );
    return {
      total,
      items: creators.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.creatorName,
        avatarUrl: c.avatarUrl,
        status: c.status,
        kycStatus: c.kycStatus,
        joinedAt: c.createdAt,
        contributed: MoneyUtil.toMajorUnits(contributed.get(c.id) ?? 0),
      })),
    };
  }

  /** Runs a `day, value` query and fills missing days with 0. */
  private async dailySeries(
    sql: Prisma.Sql,
    fromDay: string,
    toDay: string,
  ): Promise<{ day: string; value: number }[]> {
    const rows = await this.prisma.$queryRaw<DayRow[]>(sql);
    const byDay = new Map(rows.map((r) => [r.day, Number(r.value ?? 0)]));
    const out: { day: string; value: number }[] = [];
    for (
      let t = lagosDayStart(fromDay).getTime();
      lagosDay(new Date(t)) <= toDay;
      t += DAY_MS
    ) {
      const day = lagosDay(new Date(t));
      out.push({ day, value: byDay.get(day) ?? 0 });
    }
    return out;
  }
}

/** SQL for the Lagos calendar day (YYYY-MM-DD) of a UTC timestamp column. */
function lagosDaySql(column: string): Prisma.Sql {
  return Prisma.raw(
    `to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD')`,
  );
}
