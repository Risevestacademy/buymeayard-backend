import { NotFoundException } from '@nestjs/common';
import { CreatorReportsService } from './creator-reports.service';

describe('CreatorReportsService', () => {
  let prisma: {
    creatorProfile: { findFirst: jest.Mock };
    creatorReport: { create: jest.Mock };
  };
  let dispatcher: { sendEmail: jest.Mock };
  let service: CreatorReportsService;

  beforeEach(() => {
    prisma = {
      creatorProfile: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'c1', slug: 'ada', creatorName: 'Ada' }),
      },
      creatorReport: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'r1-0000', status: 'PENDING' }),
      },
    };
    dispatcher = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    service = new CreatorReportsService(
      prisma as never,
      dispatcher as never,
      { get: () => 'support@example.com' } as never,
    );
  });

  it('saves the report for a published creator and emails support', async () => {
    const res = await service.report('ada', {
      reason: 'FRAUD_OR_SCAM',
      description: 'Takes <b>payments</b> elsewhere',
      reporterEmail: 'x@example.com',
    });

    expect(prisma.creatorProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'ada', isPublished: true } }),
    );
    expect(prisma.creatorReport.create).toHaveBeenCalledWith({
      data: {
        creatorId: 'c1',
        reason: 'FRAUD_OR_SCAM',
        description: 'Takes <b>payments</b> elsewhere',
        reporterEmail: 'x@example.com',
      },
    });
    const [to, , html] = dispatcher.sendEmail.mock.calls[0];
    expect(to).toBe('support@example.com');
    expect(html).toContain('&lt;b&gt;payments');
    expect(res).toEqual({ id: 'r1-0000', status: 'PENDING' });
  });

  it('stores no email when the reporter gives none', async () => {
    await service.report('ada', { reason: 'OTHER', description: 'x' });
    expect(
      prisma.creatorReport.create.mock.calls[0][0].data.reporterEmail,
    ).toBeNull();
  });

  it('404s for an unknown or unpublished creator', async () => {
    prisma.creatorProfile.findFirst.mockResolvedValue(null);
    await expect(
      service.report('nope', { reason: 'OTHER', description: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.creatorReport.create).not.toHaveBeenCalled();
  });
});
