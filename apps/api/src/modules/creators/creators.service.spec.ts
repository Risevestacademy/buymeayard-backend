import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreatorsService } from './creators.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('CreatorsService', () => {
  let service: CreatorsService;
  let prisma: {
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
  };

  beforeEach(() => {
    prisma = {
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
    };

    service = new CreatorsService(prisma as unknown as PrismaService);
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
});
