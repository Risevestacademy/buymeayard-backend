import { Test, TestingModule } from '@nestjs/testing';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

describe('MaterialsController', () => {
  let controller: MaterialsController;
  let mockService: Partial<MaterialsService>;

  beforeEach(async () => {
    mockService = {
      findAllCatalogue: jest
        .fn()
        .mockResolvedValue([
          { id: '1', name: 'Ankara', slug: 'ankara', defaultPrice: 100000 },
        ]),
      findCatalogueBySlug: jest.fn().mockResolvedValue({
        id: '1',
        name: 'Ankara',
        slug: 'ankara',
        defaultPrice: 100000,
      }),
      getBasePrice: jest.fn().mockResolvedValue({
        basePrice: 1000,
        basePriceMinor: 100000,
        currency: 'NGN',
        materials: [],
      }),
      updateBasePrice: jest.fn().mockResolvedValue({
        success: true,
        basePrice: 1500,
        basePriceMinor: 150000,
        currency: 'NGN',
        updatedPlatformMaterialsCount: 4,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: mockService }],
    }).compile();

    controller = module.get<MaterialsController>(MaterialsController);
  });

  it('should get materials catalogue', async () => {
    const res = await controller.getMaterials();
    expect(res).toBeDefined();
    expect(mockService.findAllCatalogue).toHaveBeenCalled();
  });

  it('should get universal base price', async () => {
    const res = await controller.getBasePrice();
    expect(res.basePrice).toBe(1000);
    expect(mockService.getBasePrice).toHaveBeenCalled();
  });

  it('should update universal base price', async () => {
    const res = await controller.updateBasePrice({ price: 1500 });
    expect(res.basePrice).toBe(1500);
    expect(mockService.updateBasePrice).toHaveBeenCalledWith({ price: 1500 });
  });

  it('should get material by slug', async () => {
    const res = await controller.getMaterialBySlug('ankara');
    expect(res.name).toBe('Ankara');
    expect(mockService.findCatalogueBySlug).toHaveBeenCalledWith('ankara');
  });

  it('should calculate yards or amount', async () => {
    (mockService as any).calculate = jest.fn().mockResolvedValue({
      calculatedYards: 50,
      effectiveAmount: 50000,
    });

    const res = await controller.calculate('50000', undefined);
    expect(res.calculatedYards).toBe(50);
    expect((mockService as any).calculate).toHaveBeenCalledWith(50000, undefined);
  });
});
