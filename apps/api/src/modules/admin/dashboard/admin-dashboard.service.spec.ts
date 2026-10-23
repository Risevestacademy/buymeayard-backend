import { BadRequestException } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardService', () => {
  function setup() {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ name: 'Ada' }) },
      support: {
        count: jest.fn().mockResolvedValue(34),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { totalAmount: 600 }, _count: 3 })
          .mockResolvedValueOnce({ _sum: { totalAmount: 400 }, _count: 2 }),
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { creatorId: 'cr-1', _sum: { totalAmount: 900 } },
          ]),
      },
      creatorProfile: {
        count: jest.fn().mockResolvedValue(10),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cr-1',
            slug: 'maya',
            creatorName: 'Maya',
            avatarUrl: null,
            status: 'ACTIVE',
            kycStatus: 'VERIFIED',
            createdAt: new Date('2026-10-01'),
          },
        ]),
      },
      payout: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 0, netAmount: 0 }, _count: 0 }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    return { prisma, service: new AdminDashboardService(prisma as never) };
  }

  it('builds the overview with changes against the previous period and a zero-filled series', async () => {
    const { service } = setup();

    const res = await service.getSummary('admin-1', {
      from: '2026-10-01',
      to: '2026-10-03',
      weeks: 8,
    });

    expect(res.greeting).toMatchObject({
      adminName: 'Ada',
      newContributionsToday: 34,
    });
    expect(res.kpis.contributionsReceived).toMatchObject({
      value: 600,
      previous: 400,
      changePercent: 50,
      count: 3,
    });
    expect(res.kpis.contributionsReceived.series).toEqual([
      { day: '2026-10-01', value: 0 },
      { day: '2026-10-02', value: 0 },
      { day: '2026-10-03', value: 0 },
    ]);
    expect(res.recentCreators.items[0]).toMatchObject({
      slug: 'maya',
      contributed: 900,
    });
    expect(res.kpis.pendingPayouts.lateAfterHours).toBe(48);
  });

  it('rejects a range that ends before it starts', async () => {
    const { service } = setup();
    await expect(
      service.getSummary('admin-1', {
        from: '2026-10-05',
        to: '2026-10-01',
        weeks: 8,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
