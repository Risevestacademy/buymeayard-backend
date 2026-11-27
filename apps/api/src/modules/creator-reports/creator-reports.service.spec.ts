import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreatorReportsService } from './creator-reports.service';

describe('CreatorReportsService', () => {
  let prisma: {
    creatorProfile: { findFirst: jest.Mock };
    creatorReport: { create: jest.Mock };
  };
  let dispatcher: { sendEmail: jest.Mock };
  let storage: { uploadFile: jest.Mock };
  let service: CreatorReportsService;

  const input = {
    reason: 'SCAM_OR_FRAUD' as const,
    description: 'Takes <b>payments</b> elsewhere',
    evidenceLink1: 'https://example.com/proof',
    reporterEmail: 'x@example.com',
  };

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
    storage = {
      uploadFile: jest
        .fn()
        .mockResolvedValue({ secureUrl: 'https://cdn/proof.png' }),
    };
    service = new CreatorReportsService(
      prisma as never,
      dispatcher as never,
      { get: () => 'support@example.com' } as never,
      storage as never,
    );
  });

  it('saves the report for a published creator and emails support', async () => {
    const res = await service.report('ada', {
      ...input,
      evidenceLink2: 'https://example.com/more',
    });

    expect(prisma.creatorProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'ada', isPublished: true } }),
    );
    expect(prisma.creatorReport.create).toHaveBeenCalledWith({
      data: {
        creatorId: 'c1',
        reason: 'SCAM_OR_FRAUD',
        description: 'Takes <b>payments</b> elsewhere',
        reporterEmail: 'x@example.com',
        evidenceLinks: [
          'https://example.com/proof',
          'https://example.com/more',
        ],
        evidenceFileUrl: null,
      },
    });
    expect(storage.uploadFile).not.toHaveBeenCalled();
    const [to, subject, html] = dispatcher.sendEmail.mock.calls[0];
    expect(to).toBe('support@example.com');
    expect(subject).toContain('Scam or fraudulent activity');
    expect(html).toContain('&lt;b&gt;payments');
    expect(html).toContain('https://example.com/more');
    expect(res).toEqual({ id: 'r1-0000', status: 'PENDING' });
  });

  it('uploads the evidence file and stores and emails its link', async () => {
    const file = { buffer: Buffer.from('x') } as Express.Multer.File;
    await service.report('ada', input, file);

    expect(storage.uploadFile).toHaveBeenCalledWith(
      file.buffer,
      expect.objectContaining({ folder: 'report-evidence' }),
    );
    expect(prisma.creatorReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        evidenceFileUrl: 'https://cdn/proof.png',
      }),
    });
    expect(dispatcher.sendEmail.mock.calls[0][2]).toContain(
      'https://cdn/proof.png',
    );
  });

  it('rejects, without saving, when the file upload fails', async () => {
    storage.uploadFile.mockRejectedValue(new Error('boom'));
    await expect(
      service.report('ada', input, { buffer: Buffer.from('x') } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.creatorReport.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown or unpublished creator', async () => {
    prisma.creatorProfile.findFirst.mockResolvedValue(null);
    await expect(service.report('nope', input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.creatorReport.create).not.toHaveBeenCalled();
  });
});
