import { ForbiddenException } from '@nestjs/common';
import { SupportsService } from './supports.service';

describe('SupportsService contribution gate', () => {
  const material = {
    id: 'cm-1',
    creatorId: 'creator-1',
    status: 'ACTIVE',
    price: 500_000,
    currency: 'NGN',
    displayName: null,
    material: { name: 'Ankara' },
  };

  function setup(creatorStatus: string) {
    const prisma = {
      creatorProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'creator-1',
          userId: 'creator-user',
          status: creatorStatus,
        }),
      },
      creatorMaterial: { findUnique: jest.fn().mockResolvedValue(material) },
      support: { create: jest.fn().mockResolvedValue({ id: 'support-1' }) },
    };
    const config = { get: jest.fn().mockReturnValue(10) };
    return {
      prisma,
      service: new SupportsService(prisma as never, config as never),
    };
  }

  const dto = {
    creatorId: 'creator-1',
    items: [{ creatorMaterialId: 'cm-1', quantity: 1 }],
  };

  it.each([['PROFILE_CREATED'], ['KYC_PENDING'], ['VERIFIED'], ['SUSPENDED']])(
    'refuses contributions to a %s creator',
    async (status) => {
      const { service, prisma } = setup(status);
      await expect(
        service.createSupport('supporter-1', dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.createSupport('supporter-1', dto),
      ).rejects.toMatchObject({
        response: { code: 'CREATOR_NOT_ACTIVE' },
      });
      expect(prisma.support.create).not.toHaveBeenCalled();
    },
  );

  it('accepts contributions to an ACTIVE creator', async () => {
    const { service, prisma } = setup('ACTIVE');
    await expect(service.createSupport('supporter-1', dto)).resolves.toEqual({
      id: 'support-1',
    });
    expect(prisma.support.create).toHaveBeenCalled();
  });
});
