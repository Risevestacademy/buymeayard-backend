import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('CreatorsService', () => {
  let service: CreatorsService;
  let storage: {
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
    getSignedUrl: jest.Mock;
  };
  let prisma: {
    $transaction: jest.Mock;
    user: {
      update: jest.Mock;
    };
    creatorProfile: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    role: {
      upsert: jest.Mock;
    };
    userRole: {
      upsert: jest.Mock;
    };
    creatorSocialLink: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    authAccount: {
      findMany: jest.Mock;
    };
    material: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    creatorMaterial: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    support: {
      aggregate: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    payout: {
      aggregate: jest.Mock;
    };
  };
  let ledgerService: {
    getOrCreateAccount: jest.Mock;
    getAccountBalance: jest.Mock;
  };

  beforeEach(() => {
    storage = {
      uploadFile: jest.fn().mockResolvedValue({
        storageKey: 'mock_key',
        url: 'https://cdn.buymeayard.com/mock.jpg',
        secureUrl: 'https://cdn.buymeayard.com/mock.jpg',
        bytes: 1024,
      }),
      deleteFile: jest.fn().mockResolvedValue(true),
      getSignedUrl: jest
        .fn()
        .mockResolvedValue('https://cdn.buymeayard.com/mock.jpg'),
    };

    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      user: {
        update: jest
          .fn()
          .mockResolvedValue({ id: 'user-1', name: 'Adeola Johnson' }),
      },
      creatorProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'role-creator-id', name: 'CREATOR' }),
      },
      userRole: {
        upsert: jest
          .fn()
          .mockResolvedValue({ userId: 'user-1', roleId: 'role-creator-id' }),
      },
      creatorSocialLink: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      authAccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      material: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      creatorMaterial: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      support: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      payout: {
        aggregate: jest.fn(),
      },
    };

    ledgerService = {
      getOrCreateAccount: jest.fn().mockResolvedValue({ id: 'acc-creator-1' }),
      getAccountBalance: jest.fn().mockResolvedValue(9800000),
    };

    service = new CreatorsService(
      prisma as unknown as PrismaService,
      storage,
      ledgerService as any,
    );
  });

  describe('onboardCreator', () => {
    it('should throw BadRequestException if creatorName is missing', async () => {
      await expect(
        service.onboardCreator('user-1', { slug: 'adeola' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if slug is missing', async () => {
      await expect(
        service.onboardCreator('user-1', { creatorName: 'Adeola Johnson' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if slug is taken by another user', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-other',
        userId: 'other-user',
        slug: 'adeola',
        creatorName: 'Other Creator',
      });

      await expect(
        service.onboardCreator('user-1', {
          creatorName: 'Adeola Johnson',
          slug: 'adeola',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create new creator profile and assign CREATOR role for first-time onboarding', async () => {
      prisma.creatorProfile.findUnique
        .mockResolvedValueOnce(null) // uniqueness check for slug
        .mockResolvedValueOnce(null) // first check existing profile for user
        .mockResolvedValueOnce({
          id: 'creator-1',
          userId: 'user-1',
          creatorName: 'Adeola Johnson',
          slug: 'adeola',
          status: 'PROFILE_CREATED',
          socialLinks: [],
          materials: [],
          user: { name: 'Adeola Johnson' },
        });

      prisma.creatorProfile.create.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        status: 'PROFILE_CREATED',
        user: { name: 'Adeola Johnson' },
      });

      const result = await service.onboardCreator('user-1', {
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        socialLinks: [{ platform: 'twitter', url: 'https://x.com/adeola' }],
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Adeola Johnson' },
      });
      expect(prisma.role.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'CREATOR' } }),
      );
      expect(prisma.creatorProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          creatorName: 'Adeola Johnson',
          slug: 'adeola',
          status: 'PROFILE_CREATED',
          kycStatus: 'NOT_SUBMITTED',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
          socialLinks: true,
          materials: true,
        },
      });
      expect(prisma.creatorSocialLink.create).toHaveBeenCalledWith({
        data: {
          creatorId: 'creator-1',
          platform: 'twitter',
          url: 'https://x.com/adeola',
        },
      });
      expect(result?.creatorName).toBe('Adeola Johnson');
      expect(result?.slug).toBe('adeola');
    });

    it('should format creator profile with only creatorName and clean slug', () => {
      const formatted = service.formatCreatorProfile({
        user: { name: 'Adeola Johnson' },
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
      });

      expect(formatted.creatorName).toBe('Adeola Johnson');
      expect(formatted.slug).toBe('adeola');
      // Assert redundant name and link fields are stripped
      expect(formatted.name).toBeUndefined();
      expect(formatted.displayName).toBeUndefined();
      expect(formatted.firstName).toBeUndefined();
      expect(formatted.lastName).toBeUndefined();
      expect(formatted.username).toBeUndefined();
      expect(formatted.personalizedLink).toBeUndefined();

      // Assert live, supporter, and KYC flags
      expect(formatted.showSupportersOnPage).toBe(true);
      expect(formatted.isPublished).toBe(false);
      expect(formatted.isKycCompleted).toBe(false);
    });

    it('should include formatted material info with thumbnails, color, and price', () => {
      const formatted = service.formatCreatorProfile({
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        materials: [
          {
            id: 'cm-1',
            creatorId: 'c-1',
            materialId: 'm-1',
            price: 150000,
            currency: 'NGN',
            displayName: 'Special Ankara',
            material: {
              id: 'm-1',
              name: 'Ankara',
              slug: 'ankara',
              description: 'African print',
              color: '#7F3516',
              thumbnailSmallUrl: 'https://cdn.example.com/ankara-sm.png',
              thumbnailLargeUrl: 'https://cdn.example.com/ankara-lg.png',
              defaultPrice: 100000,
              currency: 'NGN',
              status: 'ACTIVE',
            },
          },
        ],
      });

      expect(formatted.materials).toHaveLength(1);
      expect(formatted.materials[0].name).toBe('Ankara');
      expect(formatted.materials[0].displayName).toBe('Special Ankara');
      expect(formatted.materials[0].color).toBe('#7F3516');
      expect(formatted.materials[0].thumbnailSmallUrl).toBe(
        'https://cdn.example.com/ankara-sm.png',
      );
      expect(formatted.materials[0].thumbnailLargeUrl).toBe(
        'https://cdn.example.com/ankara-lg.png',
      );
      expect(formatted.materials[0].price).toBe(150000);
      expect(formatted.materials[0].isCustom).toBe(false);
      expect(formatted.materials[0].material).toBeDefined();
      expect(formatted.materials[0].material.color).toBe('#7F3516');
      expect(formatted.material).toBeDefined();
      expect(formatted.material?.id).toBe('cm-1');
      expect(formatted.material?.name).toBe('Ankara');
      expect(formatted.selectedMaterials).toHaveLength(1);
    });

    it('should return empty materials and null material when creator has no selected materials', () => {
      const formatted = service.formatCreatorProfile({
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        materials: [],
      });

      expect(formatted.materials).toEqual([]);
      expect(formatted.selectedMaterials).toEqual([]);
      expect(formatted.material).toBeNull();
    });

    it('should return themeMaterial as selected material when themeMaterial is set', () => {
      const formatted = service.formatCreatorProfile({
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        themeMaterialId: 'm-adire',
        themeMaterial: {
          id: 'm-adire',
          name: 'Adire',
          slug: 'adire',
          description: 'Indigo dyed cloth',
          color: '#1A237E',
          thumbnailSmallUrl: 'https://cdn.example.com/adire-sm.png',
          thumbnailLargeUrl: 'https://cdn.example.com/adire-lg.png',
          defaultPrice: 100000,
          currency: 'NGN',
          status: 'ACTIVE',
        },
        materials: [],
      });

      expect(formatted.materials).toHaveLength(1);
      expect(formatted.material).toBeDefined();
      expect(formatted.material?.id).toBe('m-adire');
      expect(formatted.material?.name).toBe('Adire');
      expect(formatted.material?.slug).toBe('adire');
    });

    it('should filter to only the selected theme material if multiple platform materials are present', () => {
      const formatted = service.formatCreatorProfile({
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        themeMaterialId: 'm-adire',
        materials: [
          {
            id: 'cm-ankara',
            materialId: 'm-ankara',
            price: 100000,
            material: { id: 'm-ankara', name: 'Ankara', creatorId: null },
          },
          {
            id: 'cm-adire',
            materialId: 'm-adire',
            price: 120000,
            material: { id: 'm-adire', name: 'Adire', creatorId: null },
          },
        ],
      });

      expect(formatted.materials).toHaveLength(1);
      expect(formatted.materials[0].name).toBe('Adire');
      expect(formatted.material?.id).toBe('cm-adire');
      expect(formatted.material?.name).toBe('Adire');
    });
  });

  describe('findBySlug', () => {
    it('should resolve creator by slug', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        user: { name: 'Adeola Johnson' },
      });

      const res = await service.findBySlug('adeola');
      expect(res.slug).toBe('adeola');
    });

    it('should throw NotFoundException if creator is not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(service.findBySlug('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkSlugAvailability', () => {
    it('should return available: false if slug is empty', async () => {
      const res = await service.checkSlugAvailability('');
      expect(res.available).toBe(false);
      expect(res.reason).toContain('empty');
    });

    it('should return available: false if slug is less than 3 chars', async () => {
      const res = await service.checkSlugAvailability('ab');
      expect(res.available).toBe(false);
      expect(res.reason).toContain('at least 3 characters');
    });

    it('should return available: false if slug contains invalid characters', async () => {
      const res = await service.checkSlugAvailability('invalid handle!');
      expect(res.available).toBe(false);
      expect(res.reason).toContain('letters, numbers');
    });

    it('should return available: false if slug is a reserved word', async () => {
      const res = await service.checkSlugAvailability('admin');
      expect(res.available).toBe(false);
      expect(res.reason).toContain('reserved');
    });

    it('should return available: false if slug is already taken by another user', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-other',
        userId: 'other-user',
        slug: 'taken_handle',
      });

      const res = await service.checkSlugAvailability(
        'taken_handle',
        'my-user',
      );
      expect(res.available).toBe(false);
      expect(res.reason).toContain('already taken');
    });

    it('should return available: true and isCurrent: true if slug belongs to current user', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-self',
        userId: 'my-user',
        slug: 'my_handle',
      });

      const res = await service.checkSlugAvailability('my_handle', 'my-user');
      expect(res.available).toBe(true);
      expect(res.isCurrent).toBe(true);
    });

    it('should return available: true for a valid and unique slug', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);

      const res = await service.checkSlugAvailability('@aesthetefisayo');
      expect(res.available).toBe(true);
      expect(res.slug).toBe('aesthetefisayo');
      expect(res.message).toBe('Handle is available');
    });
  });

  describe('updateProfile', () => {
    it('should throw NotFoundException if profile does not exist', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.updateProfile('user-1', { creatorName: 'Adeola' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if creatorName is empty', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
      });
      await expect(
        service.updateProfile('user-1', { creatorName: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update profile and user name', async () => {
      prisma.creatorProfile.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          userId: 'user-1',
          creatorName: 'Old Name',
          bio: 'Old bio',
        })
        .mockResolvedValueOnce({
          id: 'creator-1',
          userId: 'user-1',
          creatorName: 'New Name',
          bio: 'New bio',
          slug: 'newname',
        });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
        creatorName: 'New Name',
        bio: 'New bio',
        slug: 'newname',
      });

      const res = await service.updateProfile('user-1', {
        creatorName: 'New Name',
        bio: 'New bio',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'New Name' },
      });
      expect(prisma.creatorProfile.update).toHaveBeenCalled();
      expect(res.creatorName).toBe('New Name');
    });
  });

  describe('uploadAvatar', () => {
    it('should throw NotFoundException if creator profile not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      const mockFile = {
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      await expect(service.uploadAvatar('user-1', mockFile)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should upload avatar and update creator profile avatarUrl', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
      });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'creator-1',
        avatarUrl: 'https://cdn.buymeayard.com/mock.jpg',
      });

      const mockFile = {
        buffer: Buffer.from('avatar-image-data'),
      } as Express.Multer.File;

      const res = await service.uploadAvatar('user-1', mockFile);

      expect(storage.uploadFile).toHaveBeenCalledWith(mockFile.buffer, {
        folder: 'avatars',
        publicId: 'creator-creator-1',
        resourceType: 'image',
      });
      expect(prisma.creatorProfile.update).toHaveBeenCalledWith({
        where: { id: 'creator-1' },
        data: { avatarUrl: 'https://cdn.buymeayard.com/mock.jpg' },
      });
      expect(res.avatarUrl).toBe('https://cdn.buymeayard.com/mock.jpg');
    });
  });

  describe('getCreatorMaterials', () => {
    it('should throw NotFoundException if profile does not exist', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(service.getCreatorMaterials('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return active materials for creator', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
      });
      prisma.creatorMaterial.findMany.mockResolvedValue([
        {
          id: 'cm-1',
          creatorId: 'creator-1',
          materialId: 'mat-1',
          price: 500000,
          status: 'ACTIVE',
        },
      ]);

      const res = await service.getCreatorMaterials('user-1');
      expect(res).toHaveLength(1);
      expect(prisma.creatorMaterial.findMany).toHaveBeenCalledWith({
        where: { creatorId: 'creator-1', status: 'ACTIVE' },
        include: { material: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('createCustomMaterial', () => {
    it('should create custom material scoped to creator and link to creator materials', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        slug: 'fisayo',
      });
      prisma.material.findFirst.mockResolvedValue({
        id: 'mat-primary',
        defaultPrice: 100000,
        currency: 'NGN',
      });
      prisma.material.create.mockResolvedValue({
        id: 'mat-custom-1',
        name: 'Silk Velvet',
        creatorId: 'creator-1',
        defaultPrice: 100000,
        currency: 'NGN',
      });
      prisma.creatorMaterial.create.mockResolvedValue({
        id: 'cm-custom-1',
        creatorId: 'creator-1',
        materialId: 'mat-custom-1',
        price: 100000,
        displayName: 'Silk Velvet',
        material: { id: 'mat-custom-1', creatorId: 'creator-1' },
      });

      const res = await service.createCustomMaterial('user-1', {
        name: 'Silk Velvet',
        description: 'Luxury custom fabric',
      });

      expect(res.isCustom).toBe(true);
      expect(prisma.material.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          creatorId: 'creator-1',
          name: 'Silk Velvet',
          defaultPrice: 100000,
          currency: 'NGN',
        }),
      });
      expect(prisma.creatorMaterial.create).toHaveBeenCalled();
    });
  });

  describe('saveCreatorMaterials', () => {
    it('should throw NotFoundException if profile does not exist', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.saveCreatorMaterials('user-1', { materials: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if material is not found in catalogue', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
      });
      prisma.material.findMany.mockResolvedValue([]);

      await expect(
        service.saveCreatorMaterials('user-1', {
          materials: [{ materialId: 'mat-invalid', price: 500000 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert creator materials and deactivate omitted ones', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
      });
      prisma.material.findMany.mockResolvedValue([
        { id: 'mat-1', name: 'Ankara', status: 'ACTIVE' },
      ]);
      prisma.creatorMaterial.upsert.mockResolvedValue({
        id: 'cm-1',
        creatorId: 'creator-1',
        materialId: 'mat-1',
        price: 500000,
      });
      prisma.creatorMaterial.updateMany.mockResolvedValue({ count: 1 });
      prisma.creatorMaterial.findMany.mockResolvedValue([
        {
          id: 'cm-1',
          creatorId: 'creator-1',
          materialId: 'mat-1',
          price: 500000,
        },
      ]);

      const res = await service.saveCreatorMaterials('user-1', {
        materials: [{ materialId: 'mat-1', price: 500000 }],
      });

      expect(prisma.creatorMaterial.upsert).toHaveBeenCalled();
      expect(prisma.creatorMaterial.updateMany).toHaveBeenCalledWith({
        where: {
          creatorId: 'creator-1',
          materialId: { notIn: ['mat-1'] },
          status: 'ACTIVE',
        },
        data: { status: 'INACTIVE' },
      });
      expect(res).toHaveLength(1);
    });
  });

  describe('getShareLink', () => {
    it('should return share link metadata with QR code and customized social links', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        materials: [
          {
            displayName: 'Premium Ankara',
            material: { name: 'Ankara' },
          },
          {
            displayName: null,
            material: { name: 'Lace' },
          },
        ],
      });

      const expectedBase = (
        process.env.CREATOR_FRONTEND_URL ||
        process.env.FRONTEND_URL ||
        'https://buymeayard.com'
      ).replace(/\/+$/, '');
      const res = await service.getShareLink('user-1');

      expect(res.slug).toBe('adeola');
      expect(res.publicUrl).toBe(`${expectedBase}/adeola`);
      expect(res.qrCodeUrl).toContain(
        `${encodeURIComponent(expectedBase)}%2Fadeola`,
      );
      expect(res.shareText).toContain('Premium Ankara or Lace');
      expect(res.socialLinks.twitter).toContain('twitter.com/intent/tweet');
      expect(res.socialLinks.whatsapp).toContain('api.whatsapp.com/send');
      expect(res.socialLinks.facebook).toContain('facebook.com/sharer');
      expect(res.socialLinks.linkedin).toContain('linkedin.com/sharing');
      expect(res.socialLinks.telegram).toContain('t.me/share');
    });

    it('should throw NotFoundException if creator is not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);

      await expect(service.getShareLink('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getShareLinkBySlug', () => {
    it('should strip leading @ and resolve share link by slug', async () => {
      const expectedBase = (
        process.env.CREATOR_FRONTEND_URL ||
        process.env.FRONTEND_URL ||
        'https://buymeayard.com'
      ).replace(/\/+$/, '');
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
        creatorName: 'Fisayo Rotibi',
        slug: 'fisayo',
        materials: [],
      });

      const res = await service.getShareLinkBySlug('@fisayo');

      expect(prisma.creatorProfile.findUnique).toHaveBeenCalledWith({
        where: { slug: 'fisayo' },
        include: {
          materials: {
            where: { status: 'ACTIVE' },
            include: { material: true },
          },
        },
      });
      expect(res.slug).toBe('fisayo');
      expect(res.publicUrl).toBe(`${expectedBase}/fisayo`);
    });

    it('should throw NotFoundException if slug not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);

      await expect(service.getShareLinkBySlug('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateCreatorSettings', () => {
    it('should update thank-you message', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
      });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        thankYouMessage: 'Thank you for your generosity! 🎉',
      });

      const res = await service.updateCreatorSettings('u-1', {
        thankYouMessage: 'Thank you for your generosity! 🎉',
      });

      expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1' },
          data: {
            thankYouMessage: 'Thank you for your generosity! 🎉',
          },
        }),
      );
      expect(res.thankYouMessage).toBe('Thank you for your generosity! 🎉');
    });

    it('should toggle showSupportersOnPage setting', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
      });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        showSupportersOnPage: false,
      });

      const res = await service.updateCreatorSettings('u-1', {
        showSupportersOnPage: false,
      });

      expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1' },
          data: {
            showSupportersOnPage: false,
          },
        }),
      );
      expect(res.showSupportersOnPage).toBe(false);
    });

    it('should set theme material when a valid platform material id is given', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
      });
      prisma.material.findFirst.mockResolvedValue({
        id: 'mat-ankara',
        name: 'Ankara',
        status: 'ACTIVE',
        creatorId: null,
      });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        themeMaterialId: 'mat-ankara',
      });

      const res = await service.updateCreatorSettings('u-1', {
        themeMaterialId: 'mat-ankara',
      });

      expect(prisma.material.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'mat-ankara',
            status: 'ACTIVE',
            creatorId: null,
          }),
        }),
      );
      expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1' },
          data: { themeMaterialId: 'mat-ankara' },
        }),
      );
      expect(res.themeMaterialId).toBe('mat-ankara');
    });

    it('should throw BadRequestException for an invalid or unknown themeMaterialId', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
      });
      prisma.material.findFirst.mockResolvedValue(null); // not found

      await expect(
        service.updateCreatorSettings('u-1', {
          themeMaterialId: 'bad-id',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePageStatus', () => {
    it('should reject publishing if required setup fields are incomplete', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        creatorName: 'Adeola',
        slug: 'adeola',
        bio: null, // missing bio
        avatarUrl: null, // missing avatar
        thankYouMessage: null, // missing thank-you message
        materials: [], // missing materials
      });

      await expect(
        service.updatePageStatus('u-1', { isPublished: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow publishing when all required setup fields are filled', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        creatorName: 'Adeola Johnson',
        slug: 'adeola',
        bio: 'Fashion designer in Lagos',
        avatarUrl: 'https://example.com/avatar.jpg',
        thankYouMessage: 'Thank you so much! 🙏',
        materials: [{ id: 'cm-1', status: 'ACTIVE' }],
      });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        isPublished: true,
      });

      const res = await service.updatePageStatus('u-1', { isPublished: true });

      expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1' },
          data: { isPublished: true },
        }),
      );
      expect(res.isPublished).toBe(true);
    });

    it('should allow unpublishing without validating completeness', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        creatorName: null,
      });
      prisma.creatorProfile.update.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        isPublished: false,
      });

      const res = await service.updatePageStatus('u-1', { isPublished: false });

      expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c-1' },
          data: { isPublished: false },
        }),
      );
      expect(res.isPublished).toBe(false);
    });
  });

  describe('getDashboardOverview', () => {
    it('should throw NotFoundException if creator profile not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.getDashboardOverview('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return complete dashboard overview with metrics, balance, recent contributions and chart', async () => {
      const mockCreator = {
        id: 'c-1',
        userId: 'u-1',
        creatorName: 'Fisayo Rotibi',
        slug: 'aesthetefisayo',
        avatarUrl: 'https://cdn.example.com/avatar.jpg',
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
        isPublished: true,
        payoutMethods: [{ id: 'pm-1' }],
      };

      prisma.creatorProfile.findUnique.mockResolvedValue(mockCreator);

      prisma.support.aggregate.mockResolvedValue({
        _count: { id: 24 },
        _sum: {
          totalAmount: 12000000,
          creatorAmount: 11400000,
          platformFee: 600000,
        },
      });

      prisma.payout.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1600000 } }) // pending
        .mockResolvedValueOnce({ _sum: { amount: 2000000 } }); // withdrawn

      prisma.support.findMany.mockResolvedValue([
        {
          id: 'sup-1',
          totalAmount: 500000,
          creatorAmount: 475000,
          currency: 'NGN',
          message: 'Love your work!',
          isAnonymous: false,
          createdAt: new Date('2026-10-05T12:00:00Z'),
          supporter: {
            id: 'sup-user-1',
            name: 'Ada Okafor',
            image: 'https://cdn.example.com/ada.jpg',
          },
          items: [
            {
              quantity: 2,
              materialNameSnapshot: 'Ankara',
              creatorMaterial: {
                material: {
                  color: '#FF6B6B',
                  imageUrl: 'https://cdn.example.com/ankara.jpg',
                  thumbnailSmallUrl: 'https://cdn.example.com/ankara_sm.jpg',
                },
              },
            },
          ],
        },
      ]);

      const result = await service.getDashboardOverview('u-1', '30d');

      expect(result).toHaveProperty('creator');
      expect(result.creator.creatorName).toBe('Fisayo Rotibi');
      expect(result.creator.pageStatus).toBe('LIVE');
      expect(result.creator.pageStatusLabel).toBe('Page is live');
      expect(result.creator.publicUrl).toContain('aesthetefisayo');

      expect(result.metrics.totalContributions).toBe(24);
      expect(result.metrics.totalContributionAmount).toBe(12000000);
      expect(result.metrics.netEarnings).toBe(11400000);
      expect(result.metrics.platformFees).toBe(600000);

      expect(result.balance.availableBalance).toBe(9800000);
      expect(result.balance.pendingBalance).toBe(1600000);
      expect(result.balance.withdrawnToDate).toBe(2000000);
      expect(result.balance.canWithdraw).toBe(true);

      expect(result.recentContributions).toHaveLength(1);
      expect(result.recentContributions[0].supporter.initials).toBe('AO');
      expect(result.recentContributions[0].material?.name).toBe('Ankara');

      expect(result.earningsChart.period).toBe('30d');
      expect(result.earningsChart.dataPoints.length).toBeGreaterThan(0);
    });
  });

  describe('getDashboardBalance', () => {
    it('should throw NotFoundException if creator does not exist', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(service.getDashboardBalance('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should compute canWithdraw as false if KYC is not verified', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        status: 'ACTIVE',
        kycStatus: 'PENDING',
        payoutMethods: [{ id: 'pm-1' }],
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });

      const balance = await service.getDashboardBalance('u-1');
      expect(balance.canWithdraw).toBe(false);
    });

    it('should compute canWithdraw as false if no payout method is added', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
        payoutMethods: [],
      });
      prisma.payout.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 0 } })
        .mockResolvedValueOnce({ _sum: { amount: 0 } });

      const balance = await service.getDashboardBalance('u-1');
      expect(balance.canWithdraw).toBe(false);
    });
  });

  describe('getDashboardEarnings', () => {
    it('should throw NotFoundException if creator not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.getDashboardEarnings('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return earnings chart points for period 7d', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
      });
      prisma.support.findMany.mockResolvedValue([]);

      const chart = await service.getDashboardEarnings('u-1', { period: '7d' });
      expect(chart.period).toBe('7d');
      expect(chart.dataPoints.length).toBe(7);
    });
  });

  describe('getDashboardContributions', () => {
    it('should throw NotFoundException if creator not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.getDashboardContributions('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return paginated contributions with supporter initials and anonymous handling', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'c-1',
        userId: 'u-1',
      });
      prisma.support.count.mockResolvedValue(2);
      prisma.support.findMany.mockResolvedValue([
        {
          id: 's-1',
          totalAmount: 100000,
          creatorAmount: 95000,
          currency: 'NGN',
          message: null,
          isAnonymous: true,
          createdAt: new Date('2026-10-06T10:00:00Z'),
          supporter: null,
          items: [],
        },
        {
          id: 's-2',
          totalAmount: 200000,
          creatorAmount: 190000,
          currency: 'NGN',
          message: 'Congrats!',
          isAnonymous: false,
          createdAt: new Date('2026-10-06T11:00:00Z'),
          supporter: { id: 'u-sup', name: 'Chidi Nwosu', image: null },
          items: [
            {
              quantity: 1,
              materialNameSnapshot: 'Lace',
              creatorMaterial: { material: { color: '#00FF00' } },
            },
          ],
        },
      ]);

      const res = await service.getDashboardContributions('u-1', {
        page: 1,
        limit: 10,
      });

      expect(res.pagination.total).toBe(2);
      expect(res.data).toHaveLength(2);
      expect(res.data[0].supporter.name).toBe('Anonymous');
      expect(res.data[0].supporter.initials).toBe('AN');
      expect(res.data[1].supporter.name).toBe('Chidi Nwosu');
      expect(res.data[1].supporter.initials).toBe('CN');
      expect(res.data[1].material?.name).toBe('Lace');
    });
  });

  describe('getDashboardMetrics', () => {
    it('should throw NotFoundException if creator profile not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(service.getDashboardMetrics('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return aggregated KPI metrics for creator', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({ id: 'c-1' });
      prisma.support.aggregate.mockResolvedValue({
        _count: { id: 15 },
        _sum: {
          totalAmount: 7500000,
          creatorAmount: 7125000,
          platformFee: 375000,
        },
      });

      const metrics = await service.getDashboardMetrics('u-1');
      expect(metrics.totalContributions).toBe(15);
      expect(metrics.totalContributionAmount).toBe(7500000);
      expect(metrics.netEarnings).toBe(7125000);
      expect(metrics.platformFees).toBe(375000);
      expect(metrics.currency).toBe('NGN');
    });
  });

  describe('getDashboardRecentContributions', () => {
    it('should throw NotFoundException if creator profile not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);
      await expect(
        service.getDashboardRecentContributions('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return recent contributions list with limit', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({ id: 'c-1' });
      prisma.support.findMany.mockResolvedValue([
        {
          id: 's-1',
          totalAmount: 500000,
          creatorAmount: 475000,
          currency: 'NGN',
          message: 'Great work!',
          isAnonymous: false,
          createdAt: new Date('2026-10-06T12:00:00Z'),
          supporter: { id: 'u-1', name: 'Ada Okafor', image: null },
          items: [
            {
              quantity: 1,
              materialNameSnapshot: 'Ankara',
              creatorMaterial: { material: { color: '#FF0000' } },
            },
          ],
        },
      ]);

      const list = await service.getDashboardRecentContributions('u-1', 5);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('s-1');
      expect(list[0].supporter.name).toBe('Ada Okafor');
      expect(list[0].material?.name).toBe('Ankara');
    });
  });
});
