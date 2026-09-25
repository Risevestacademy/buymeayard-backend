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
        service.onboardCreator('user-1', { personalizedLink: 'adeola' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if personalizedLink is missing', async () => {
      await expect(
        service.onboardCreator('user-1', { creatorName: 'Adeola Johnson' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if personalizedLink or username is taken by another user', async () => {
      prisma.creatorProfile.findFirst.mockResolvedValue({
        id: 'creator-other',
        userId: 'other-user',
        username: 'adeola',
        personalizedLink: 'buymeayard/adeola',
      });

      await expect(
        service.onboardCreator('user-1', {
          creatorName: 'Adeola Johnson',
          personalizedLink: 'buymeayard/adeola',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create new creator profile and assign CREATOR role for first-time onboarding', async () => {
      prisma.creatorProfile.findFirst.mockResolvedValue(null);
      prisma.creatorProfile.findUnique
        .mockResolvedValueOnce(null) // first check existing profile
        .mockResolvedValueOnce({
          id: 'creator-1',
          userId: 'user-1',
          username: 'adeola',
          personalizedLink: 'buymeayard/adeola',
          status: 'PROFILE_CREATED',
          socialLinks: [],
          materials: [],
          user: { name: 'Adeola Johnson' },
        });

      prisma.creatorProfile.create.mockResolvedValue({
        id: 'creator-1',
        userId: 'user-1',
        username: 'adeola',
        personalizedLink: 'buymeayard/adeola',
        status: 'PROFILE_CREATED',
        user: { name: 'Adeola Johnson' },
      });

      const result = await service.onboardCreator('user-1', {
        creatorName: 'Adeola Johnson',
        personalizedLink: 'buymeayard/adeola',
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
          username: 'adeola',
          personalizedLink: 'buymeayard/adeola',
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
      expect(result?.username).toBe('adeola');
    });

    it('should format creator profile with creatorName and personalizedLink', () => {
      const formatted = service.formatCreatorProfile({
        user: { name: 'Adeola Johnson' },
        username: 'adeola',
        personalizedLink: 'buymeayard/adeola',
      });

      expect(formatted.creatorName).toBe('Adeola Johnson');
      expect(formatted.name).toBe('Adeola Johnson');
      expect(formatted.personalizedLink).toBe('buymeayard/adeola');
      expect(formatted.firstName).toBe('Adeola');
      expect(formatted.lastName).toBe('Johnson');
    });
  });

  describe('findByUsername', () => {
    it('should resolve by username or personalizedLink', async () => {
      prisma.creatorProfile.findFirst.mockResolvedValue({
        id: 'creator-1',
        username: 'adeola',
        personalizedLink: 'buymeayard/adeola',
        user: { name: 'Adeola Johnson' },
      });

      const res = await service.findByUsername('buymeayard/adeola');
      expect(res.username).toBe('adeola');
    });

    it('should throw NotFoundException if creator is not found', async () => {
      prisma.creatorProfile.findFirst.mockResolvedValue(null);
      await expect(service.findByUsername('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
