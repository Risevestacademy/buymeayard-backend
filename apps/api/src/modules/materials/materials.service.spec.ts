import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsService } from './materials.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let mockPrisma: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      material: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      creatorMaterial: {
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MaterialsService>(MaterialsService);
  });

  describe('findAllCatalogue', () => {
    it('should return active materials from catalogue', async () => {
      const mockMaterials = [
        {
          id: 'mat-1',
          name: 'Ankara',
          slug: 'ankara',
          defaultPrice: 100000,
          status: 'ACTIVE',
        },
      ];
      mockPrisma.material.findMany.mockResolvedValue(mockMaterials);

      const result = await service.findAllCatalogue();
      expect(result).toEqual(mockMaterials);
    });

    it('should auto-seed default materials if catalogue is empty', async () => {
      mockPrisma.material.findMany.mockResolvedValue([]);
      mockPrisma.material.upsert.mockImplementation(({ create }: any) =>
        Promise.resolve({ id: 'gen-id', ...create }),
      );

      const result = await service.findAllCatalogue();
      expect(mockPrisma.material.upsert).toHaveBeenCalledTimes(6);
      expect(result.length).toBe(6);
    });
  });

  describe('findByIdOrSlug / findCatalogueBySlug', () => {
    it('should return material by slug or id', async () => {
      const mockMat = { id: 'mat-1', name: 'Ankara', slug: 'ankara' };
      mockPrisma.material.findFirst.mockResolvedValue(mockMat);

      const result = await service.findCatalogueBySlug('ankara');
      expect(result).toEqual(mockMat);
    });

    it('should throw NotFoundException if slug not found', async () => {
      mockPrisma.material.findFirst.mockResolvedValue(null);

      await expect(service.findCatalogueBySlug('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getBasePrice', () => {
    it('should return universal base price details in major and minor units', async () => {
      const mockMaterials = [
        {
          id: '1',
          name: 'Ankara',
          slug: 'ankara',
          defaultPrice: 100000,
          currency: 'NGN',
        },
        {
          id: '2',
          name: 'Lace',
          slug: 'lace',
          defaultPrice: 100000,
          currency: 'NGN',
        },
      ];
      mockPrisma.material.findMany.mockResolvedValue(mockMaterials);

      const result = await service.getBasePrice();
      expect(result.basePrice).toBe(1000);
      expect(result.basePriceMinor).toBe(100000);
      expect(result.currency).toBe('NGN');
      expect(result.materials.length).toBe(2);
    });
  });

  describe('updateBasePrice', () => {
    it('should update all platform materials with new base price in minor units', async () => {
      mockPrisma.material.updateMany.mockResolvedValue({ count: 4 });

      const result = await service.updateBasePrice({
        price: 1500, // ₦1,500
        currency: 'NGN',
      });

      expect(mockPrisma.material.updateMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        data: {
          defaultPrice: 150000, // 1500 * 100
          currency: 'NGN',
        },
      });
      expect(result.success).toBe(true);
      expect(result.basePrice).toBe(1500);
      expect(result.basePriceMinor).toBe(150000);
    });

    it('should also update creator materials when updateCreatorMaterials is true', async () => {
      mockPrisma.material.updateMany.mockResolvedValue({ count: 4 });
      mockPrisma.creatorMaterial.updateMany.mockResolvedValue({ count: 12 });

      const result = await service.updateBasePrice({
        price: 2000,
        updateCreatorMaterials: true,
      });

      expect(mockPrisma.creatorMaterial.updateMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        data: {
          price: 200000,
          currency: 'NGN',
        },
      });
      expect(result.updatedCreatorMaterialsCount).toBe(12);
    });
  });

  describe('calculate', () => {
    beforeEach(() => {
      mockPrisma.material.findMany.mockResolvedValue([
        { id: '1', name: 'Ankara', defaultPrice: 100000, currency: 'NGN' },
      ]);
    });

    it('should calculate yards from amount (e.g. 50,000 NGN -> 50 yards at 1,000 NGN/yard)', async () => {
      const result = await service.calculate(50000);
      expect(result.basePricePerYard).toBe(1000);
      expect(result.calculatedYards).toBe(50);
      expect(result.effectiveAmount).toBe(50000);
      expect(result.remainder).toBe(0);
      expect(result.summary).toContain('50,000 NGN gifts 50 yards');
    });

    it('should handle amount with remainder (e.g. 5,500 NGN -> 5 yards, 500 remainder)', async () => {
      const result = await service.calculate(5500);
      expect(result.calculatedYards).toBe(5);
      expect(result.effectiveAmount).toBe(5000);
      expect(result.remainder).toBe(500);
    });

    it('should calculate total amount from yards (e.g. 50 yards -> 50,000 NGN)', async () => {
      const result = await service.calculate(undefined, 50);
      expect(result.yards).toBe(50);
      expect(result.totalAmount).toBe(50000);
      expect(result.totalAmountMinor).toBe(5000000);
      expect(result.summary).toContain(
        '50 yards of material equals 50,000 NGN',
      );
    });

    it('should default to 1 yard when no arguments provided', async () => {
      const result = await service.calculate();
      expect(result.yards).toBe(1);
      expect(result.totalAmount).toBe(1000);
    });
  });

  describe('createMaterial', () => {
    it('should create new material with generated slug and universal base price', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);
      mockPrisma.material.findMany.mockResolvedValue([
        { id: '1', defaultPrice: 100000, currency: 'NGN' },
      ]);
      mockPrisma.material.create.mockResolvedValue({
        id: 'new-id',
        name: 'Velvet Lace',
        slug: 'velvet-lace',
        defaultPrice: 100000,
        currency: 'NGN',
        status: 'ACTIVE',
      });

      const res = await service.createMaterial({
        name: 'Velvet Lace',
        description: 'Luxury velvet fabric',
      });

      expect(res.name).toBe('Velvet Lace');
      expect(mockPrisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Velvet Lace',
          slug: 'velvet-lace',
          defaultPrice: 100000,
          currency: 'NGN',
          status: 'ACTIVE',
        }),
      });
    });

    it('should throw ConflictException if slug already exists', async () => {
      mockPrisma.material.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createMaterial({ name: 'Ankara', slug: 'ankara' }),
      ).rejects.toThrow();
    });
  });

  describe('updateMaterial', () => {
    it('should update material fields', async () => {
      mockPrisma.material.findUnique.mockResolvedValue({
        id: 'mat-1',
        name: 'Ankara',
        slug: 'ankara',
      });
      mockPrisma.material.update.mockResolvedValue({
        id: 'mat-1',
        name: 'Updated Ankara',
        slug: 'updated-ankara',
      });

      const res = await service.updateMaterial('mat-1', {
        name: 'Updated Ankara',
      });

      expect(res.name).toBe('Updated Ankara');
      expect(mockPrisma.material.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if material does not exist', async () => {
      mockPrisma.material.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMaterial('mat-none', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMaterial', () => {
    it('should delete material permanently if no support history exists', async () => {
      mockPrisma.material.findUnique.mockResolvedValue({
        id: 'mat-1',
        creatorMaterials: [{ supportItems: [] }],
      });
      mockPrisma.material.delete.mockResolvedValue({ id: 'mat-1' });

      const res = await service.deleteMaterial('mat-1');
      expect(res.success).toBe(true);
      expect(mockPrisma.material.delete).toHaveBeenCalledWith({
        where: { id: 'mat-1' },
      });
    });

    it('should soft-delete (deactivate) material if support items exist', async () => {
      mockPrisma.material.findUnique.mockResolvedValue({
        id: 'mat-1',
        creatorMaterials: [{ supportItems: [{ id: 'sup-item-1' }] }],
      });
      mockPrisma.material.update.mockResolvedValue({
        id: 'mat-1',
        status: 'INACTIVE',
      });

      const res = await service.deleteMaterial('mat-1');
      expect(res.success).toBe(true);
      expect(res.status).toBe('INACTIVE');
      expect(mockPrisma.material.update).toHaveBeenCalledWith({
        where: { id: 'mat-1' },
        data: { status: 'INACTIVE' },
      });
    });
  });
});
