import { Test, TestingModule } from '@nestjs/testing';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';

describe('CreatorsController', () => {
  let controller: CreatorsController;
  let creatorsService: {
    findAll: jest.Mock;
    findByUserId: jest.Mock;
    findBySlug: jest.Mock;
    findByUsername: jest.Mock;
    onboardCreator: jest.Mock;
    formatCreatorProfile: jest.Mock;
    checkSlugAvailability: jest.Mock;
    updateProfile: jest.Mock;
    uploadAvatar: jest.Mock;
    getCreatorMaterials: jest.Mock;
    saveCreatorMaterials: jest.Mock;
  };

  const rawCreatorProfile = {
    id: 'creator-1',
    userId: 'user-1',
    slug: 'adeola',
    creatorName: 'Adeola Johnson',
    status: 'PROFILE_CREATED',
    kycStatus: 'NOT_SUBMITTED',
    socialLinks: [],
    materials: [],
  };

  beforeEach(async () => {
    creatorsService = {
      findAll: jest.fn(),
      findByUserId: jest.fn(),
      findBySlug: jest.fn(),
      findByUsername: jest.fn(),
      onboardCreator: jest.fn(),
      checkSlugAvailability: jest.fn(),
      updateProfile: jest.fn(),
      uploadAvatar: jest.fn(),
      getCreatorMaterials: jest.fn(),
      saveCreatorMaterials: jest.fn(),
      formatCreatorProfile: jest.fn((p) => {
        if (!p) return p;
        const {
          name: _name,
          displayName: _displayName,
          firstName: _firstName,
          lastName: _lastName,
          username: _username,
          personalizedLink: _personalizedLink,
          ...clean
        } = p;
        return {
          ...clean,
          creatorName: p.creatorName || p.user?.name || '',
          slug: p.slug || p.username || '',
        };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [
        {
          provide: CreatorsService,
          useValue: creatorsService,
        },
      ],
    }).compile();

    controller = module.get<CreatorsController>(CreatorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyProfile (GET /creators/me)', () => {
    it('should return creator profile with creatorName and slug, and without redundant name fields', async () => {
      creatorsService.findByUserId.mockResolvedValue({
        ...rawCreatorProfile,
        name: 'Adeola Johnson',
        displayName: 'Adeola Johnson',
        firstName: 'Adeola',
        lastName: 'Johnson',
      });

      const result = await controller.getMyProfile('user-1');

      expect(creatorsService.findByUserId).toHaveBeenCalledWith('user-1');
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.creatorName).toBe('Adeola Johnson');
      expect(result.slug).toBe('adeola');
      expect(result.username).toBeUndefined();
      expect(result.personalizedLink).toBeUndefined();

      // Verify that redundant name fields are strictly NOT returned
      expect(result.name).toBeUndefined();
      expect(result.displayName).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });
  });

  describe('onboardCreator (PUT /creators/me/onboarding)', () => {
    it('should onboard creator using pure slug and return clean creator profile', async () => {
      const dto = {
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        socialLinks: [{ platform: 'twitter', url: 'https://x.com/adeola' }],
      };

      creatorsService.onboardCreator.mockResolvedValue({
        ...rawCreatorProfile,
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
      });

      const result = await controller.onboardCreator('user-1', dto);

      expect(creatorsService.onboardCreator).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.creatorName).toBe('Adeola Johnson');
      expect(result.slug).toBe('adeola');
      expect(result.name).toBeUndefined();
      expect(result.displayName).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
      expect(result.username).toBeUndefined();
      expect(result.personalizedLink).toBeUndefined();
    });
  });

  describe('getCreatorBySlug (GET /creators/:slug)', () => {
    it('should return public creator profile formatted with creatorName and slug', async () => {
      creatorsService.findBySlug.mockResolvedValue(rawCreatorProfile);

      const result = await controller.getCreatorBySlug('adeola');

      expect(creatorsService.findBySlug).toHaveBeenCalledWith('adeola');
      expect(creatorsService.formatCreatorProfile).toHaveBeenCalled();
      expect(result.creatorName).toBe('Adeola Johnson');
      expect(result.slug).toBe('adeola');
      expect(result.name).toBeUndefined();
      expect(result.displayName).toBeUndefined();
      expect(result.username).toBeUndefined();
      expect(result.personalizedLink).toBeUndefined();
    });
  });

  describe('getCreators (GET /creators)', () => {
    it('should return list of creators from creatorsService.findAll', async () => {
      const mockCreators = [
        { ...rawCreatorProfile, creatorName: 'Adeola Johnson', slug: 'adeola' },
      ];
      creatorsService.findAll.mockResolvedValue(mockCreators);

      const result = await controller.getCreators({ search: 'adeola' });

      expect(creatorsService.findAll).toHaveBeenCalledWith({
        search: 'adeola',
      });
      expect(result).toEqual(mockCreators);
    });
  });

  describe('checkSlug (GET /creators/check-slug)', () => {
    it('should call creatorsService.checkSlugAvailability with query and userId', async () => {
      const mockResult = {
        available: true,
        slug: 'aesthetefisayo',
        message: 'Handle is available',
      };
      creatorsService.checkSlugAvailability = jest
        .fn()
        .mockResolvedValue(mockResult);

      const result = await controller.checkSlug('aesthetefisayo', 'user-1');

      expect(creatorsService.checkSlugAvailability).toHaveBeenCalledWith(
        'aesthetefisayo',
        'user-1',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateProfile (PUT /creators/me/profile)', () => {
    it('should update profile via service', async () => {
      const dto = { creatorName: 'Updated Name', bio: 'Updated bio' };
      creatorsService.updateProfile.mockResolvedValue({
        id: 'creator-1',
        slug: 'adeola',
        ...dto,
      });

      const result = await controller.updateProfile('user-1', dto);

      expect(creatorsService.updateProfile).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ id: 'creator-1', slug: 'adeola', ...dto });
    });
  });

  describe('uploadAvatar (POST /creators/me/avatar)', () => {
    it('should delegate avatar upload to service', async () => {
      const mockFile = { buffer: Buffer.from('data') } as Express.Multer.File;
      creatorsService.uploadAvatar.mockResolvedValue({
        avatarUrl: 'https://cdn.buymeayard.com/avatar.jpg',
      });

      const result = await controller.uploadAvatar('user-1', mockFile);

      expect(creatorsService.uploadAvatar).toHaveBeenCalledWith(
        'user-1',
        mockFile,
      );
      expect(result.avatarUrl).toBe('https://cdn.buymeayard.com/avatar.jpg');
    });
  });

  describe('getMyMaterials (GET /creators/me/materials)', () => {
    it('should return creator materials', async () => {
      const mockMaterials = [{ id: 'cm-1', price: 500000 }];
      creatorsService.getCreatorMaterials.mockResolvedValue(mockMaterials);

      const result = await controller.getMyMaterials('user-1');

      expect(creatorsService.getCreatorMaterials).toHaveBeenCalledWith(
        'user-1',
      );
      expect(result).toEqual(mockMaterials);
    });
  });

  describe('saveMyMaterials (PUT /creators/me/materials)', () => {
    it('should save creator materials', async () => {
      const dto = { materials: [{ materialId: 'mat-1', price: 500000 }] };
      const mockMaterials = [{ id: 'cm-1', ...dto.materials[0] }];
      creatorsService.saveCreatorMaterials.mockResolvedValue(mockMaterials);

      const result = await controller.saveMyMaterials('user-1', dto);

      expect(creatorsService.saveCreatorMaterials).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
      expect(result).toEqual(mockMaterials);
    });
  });
});
