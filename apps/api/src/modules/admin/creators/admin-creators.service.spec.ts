import { BadRequestException } from '@nestjs/common';
import { AdminCreatorsService } from './admin-creators.service';

describe('AdminCreatorsService.setStatus', () => {
  function setup(creator: unknown) {
    const prisma = {
      creatorProfile: {
        findUnique: jest.fn().mockResolvedValue(creator),
        update: jest.fn(),
      },
    };
    const audit = { record: jest.fn() };
    const service = new AdminCreatorsService(
      prisma as never,
      audit as never,
      {} as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({} as never);
    return { service, prisma, audit };
  }

  const verified = {
    id: 'cr-1',
    status: 'SUSPENDED',
    kycStatus: 'VERIFIED',
    kycBlockedAt: null,
  };

  it('suspends and unpublishes, recording the reason', async () => {
    const { service, prisma, audit } = setup({ ...verified, status: 'ACTIVE' });

    await service.setStatus('cr-1', 'admin-1', {
      status: 'SUSPENDED' as never,
      reason: 'Scam report',
    });

    expect(prisma.creatorProfile.update).toHaveBeenCalledWith({
      where: { id: 'cr-1' },
      data: { status: 'SUSPENDED', isPublished: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { reason: 'Scam report' } }),
    );
  });

  it('reactivates only a verified, unblocked creator', async () => {
    const ok = setup(verified);
    await ok.service.setStatus('cr-1', 'admin-1', {
      status: 'ACTIVE' as never,
      reason: 'Cleared',
    });
    expect(ok.prisma.creatorProfile.update).toHaveBeenCalled();

    for (const creator of [
      { ...verified, kycStatus: 'REJECTED' },
      { ...verified, kycBlockedAt: new Date() },
    ]) {
      const { service, prisma } = setup(creator);
      await expect(
        service.setStatus('cr-1', 'admin-1', {
          status: 'ACTIVE' as never,
          reason: 'x',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.creatorProfile.update).not.toHaveBeenCalled();
    }
  });
});
