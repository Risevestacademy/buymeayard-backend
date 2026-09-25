import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('UsersService', () => {
  let usersService: UsersService;
  let prismaService: jest.Mocked<Partial<PrismaService>>;

  beforeEach(() => {
    prismaService = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      } as any,
    };

    usersService = new UsersService(prismaService as PrismaService);
  });

  describe('findByIdWithRoles', () => {
    it('should return user with mapped role names and creator profile', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'ade@example.com',
        name: 'Ade',
        image: 'https://example.com/avatar.jpg',
        emailVerified: true,
        status: 'ACTIVE',
        roles: [{ role: { name: 'CREATOR' } }],
        creatorProfile: {
          id: 'creator-1',
          username: 'adeola',
          displayName: 'Adeola',
          personalizedLink: 'buymeayard/adeola',
          status: 'ACTIVE',
          kycStatus: 'VERIFIED',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await usersService.findByIdWithRoles('user-1');
      expect(result.id).toBe('user-1');
      expect(result.roles).toEqual(['CREATOR']);
      expect(result.creatorProfile?.username).toBe('adeola');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        usersService.findByIdWithRoles('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicProfile', () => {
    it('should return safe public profile without sensitive fields', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Ade',
        image: 'https://example.com/avatar.jpg',
        creatorProfile: {
          id: 'creator-1',
          username: 'adeola',
          displayName: 'Adeola',
          personalizedLink: 'buymeayard.com/adeola',
          status: 'ACTIVE',
        },
        createdAt: new Date(),
      };

      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await usersService.getPublicProfile('user-1');
      expect(result.id).toBe('user-1');
      expect(result.name).toBe('Ade');
      expect(result.creatorProfile?.username).toBe('adeola');
      // Assert sensitive fields are undefined in public profile
      expect((result as any).email).toBeUndefined();
      expect((result as any).roles).toBeUndefined();
      expect((result as any).status).toBeUndefined();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        usersService.getPublicProfile('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update user fields and return updated profile', async () => {
      (prismaService.user!.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
      });
      (prismaService.user!.update as jest.Mock).mockResolvedValue({
        id: 'user-1',
        name: 'New Name',
        image: 'https://example.com/new.jpg',
        email: 'test@example.com',
        status: 'ACTIVE',
      });

      const result = await usersService.updateProfile('user-1', {
        name: 'New Name',
        image: 'https://example.com/new.jpg',
      });

      expect(result.name).toBe('New Name');
      expect(prismaService.user!.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          name: 'New Name',
          image: 'https://example.com/new.jpg',
        },
        select: expect.any(Object),
      });
    });
  });
});
