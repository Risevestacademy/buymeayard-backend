import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminMaterialsService } from './admin-materials.service';

describe('AdminMaterialsService', () => {
  function setup() {
    const prisma = {
      material: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'm-1', name: 'X', status: 'ACTIVE' }),
        update: jest.fn().mockResolvedValue({ id: 'm-1' }),
        delete: jest.fn(),
      },
      creatorProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cr-1' }),
      },
      creatorMaterial: { groupBy: jest.fn().mockResolvedValue([]) },
      supportItem: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const audit = { record: jest.fn() };
    const materials = {
      getBasePrice: jest
        .fn()
        .mockResolvedValue({ basePriceMinor: 100_000, currency: 'NGN' }),
    };
    const service = new AdminMaterialsService(
      prisma as never,
      audit as never,
      materials as never,
    );
    jest.spyOn(service, 'get').mockResolvedValue({} as never);
    return { service, prisma, audit };
  }

  describe('list', () => {
    it('filters by source and returns summary, naira prices and visibility', async () => {
      const { service, prisma } = setup();
      prisma.material.count
        .mockResolvedValueOnce(1) // filtered total
        .mockResolvedValueOnce(5) // all
        .mockResolvedValueOnce(3) // active
        .mockResolvedValueOnce(2); // platform
      const updatedAt = new Date('2026-10-01');
      prisma.material.findFirst.mockResolvedValue({ updatedAt });
      prisma.material.findMany.mockResolvedValue([
        { id: 'm-1', defaultPrice: 150_000, creatorId: 'cr-1', creator: {} },
      ]);
      prisma.creatorMaterial.groupBy.mockResolvedValue([
        { materialId: 'm-1', _count: { _all: 4 } },
      ]);

      const res = await service.list({
        page: 1,
        limit: 20,
        source: 'CREATOR',
      } as never);

      expect(prisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { creatorId: { not: null } },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(res.summary).toEqual({
        totalMaterials: 5,
        active: 3,
        inactive: 2,
        platformMaterials: 2,
        creatorMaterials: 3,
        lastUpdatedAt: updatedAt,
      });
      expect(res.items[0]).toMatchObject({
        defaultPrice: 1500,
        source: 'CREATOR',
        visibleOnCreatorPages: 4,
      });
      expect(res.pagination.total).toBe(1);
    });

    it('searches name and slug', async () => {
      const { service, prisma } = setup();
      await service.list({ page: 1, limit: 20, search: 'lace' });
      expect(prisma.material.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'lace', mode: 'insensitive' } },
              { slug: { contains: 'lace', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('slugifies, defaults the price to the base price and audits', async () => {
      const { service, prisma, audit } = setup();

      await service.create('admin-1', { name: 'Velvet Lace!' });

      expect(prisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'velvet-lace',
          defaultPrice: 100_000,
          status: 'ACTIVE',
          creatorId: null,
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-1',
          action: 'admin.material.created',
        }),
      );
    });

    it('converts a naira price to kobo', async () => {
      const { service, prisma } = setup();
      await service.create('admin-1', {
        name: 'Silk',
        defaultPrice: 2500,
      });
      expect(prisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ defaultPrice: 250_000 }),
      });
    });

    it('rejects a taken slug', async () => {
      const { service, prisma } = setup();
      prisma.material.findUnique.mockResolvedValue({ id: 'other' });
      await expect(service.create('admin-1', { name: 'Lace' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.material.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown owner', async () => {
      const { service, prisma } = setup();
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.create('admin-1', { name: 'Lace', creatorId: 'nope' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const existing = {
      id: 'm-1',
      name: 'Lace',
      slug: 'lace',
      status: 'ACTIVE',
      defaultPrice: 100_000,
    };

    it('404s for a missing material', async () => {
      const { service } = setup();
      await expect(
        service.update('m-1', 'admin-1', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates status and price (naira to kobo) and audits before and after', async () => {
      const { service, prisma, audit } = setup();
      prisma.material.findUnique.mockResolvedValue(existing);
      prisma.material.update.mockResolvedValue({
        ...existing,
        status: 'INACTIVE',
        defaultPrice: 200_000,
      });

      await service.update('m-1', 'admin-1', {
        status: 'INACTIVE',
        defaultPrice: 2000,
      });

      expect(prisma.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: expect.objectContaining({
          status: 'INACTIVE',
          defaultPrice: 200_000,
          slug: undefined,
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.material.updated',
          previousState: expect.objectContaining({ status: 'ACTIVE' }),
          newState: expect.objectContaining({ status: 'INACTIVE' }),
        }),
      );
    });

    it('rejects a slug owned by another material', async () => {
      const { service, prisma } = setup();
      prisma.material.findUnique
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce({ id: 'other' });
      await expect(
        service.update('m-1', 'admin-1', { slug: 'Taken' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.material.update).not.toHaveBeenCalled();
    });

    it('clears an optional field sent as an empty string', async () => {
      const { service, prisma } = setup();
      prisma.material.findUnique.mockResolvedValue(existing);
      prisma.material.update.mockResolvedValue(existing);
      await service.update('m-1', 'admin-1', { description: '' });
      expect(prisma.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: expect.objectContaining({ description: null }),
      });
    });
  });

  describe('remove', () => {
    it('404s for a missing material', async () => {
      const { service } = setup();
      await expect(service.remove('m-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hard-deletes an unused material', async () => {
      const { service, prisma, audit } = setup();
      prisma.material.findUnique.mockResolvedValue({
        id: 'm-1',
        name: 'Lace',
        status: 'ACTIVE',
      });

      const res = await service.remove('m-1', 'admin-1');

      expect(prisma.material.delete).toHaveBeenCalledWith({
        where: { id: 'm-1' },
      });
      expect(res).toMatchObject({ deleted: true, status: null });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.material.deleted' }),
      );
    });

    it('deactivates instead when there is support history', async () => {
      const { service, prisma, audit } = setup();
      prisma.material.findUnique.mockResolvedValue({
        id: 'm-1',
        name: 'Lace',
        status: 'ACTIVE',
      });
      prisma.supportItem.findFirst.mockResolvedValue({ id: 'si-1' });

      const res = await service.remove('m-1', 'admin-1');

      expect(prisma.material.delete).not.toHaveBeenCalled();
      expect(prisma.material.update).toHaveBeenCalledWith({
        where: { id: 'm-1' },
        data: { status: 'INACTIVE' },
      });
      expect(res).toMatchObject({ deleted: false, status: 'INACTIVE' });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.material.deactivated' }),
      );
    });
  });
});
