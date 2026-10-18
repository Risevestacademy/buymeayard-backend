import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ErrorCodes } from '../../common/errors/error-codes';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }

  async findByIdWithRoles(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
        creatorProfile: {
          select: {
            id: true,
            slug: true,
            creatorName: true,
            status: true,
            kycStatus: true,
            kycBlockedReason: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    const isCompleted =
      user.creatorProfile !== null &&
      user.creatorProfile.status !== 'REGISTERED';

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      status: user.status,
      roles: user.roles.map((r) => r.role.name),
      isOnboardingCompleted: isCompleted,
      isProfileSetupCompleted: isCompleted,
      creatorProfile: user.creatorProfile
        ? {
            id: user.creatorProfile.id,
            slug: user.creatorProfile.slug,
            creatorName: user.creatorProfile.creatorName || user.name || '',
            status: user.creatorProfile.status,
            kycStatus: user.creatorProfile.kycStatus,
            kycBlockedReason: user.creatorProfile.kycBlockedReason ?? null,
          }
        : null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async getPublicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        creatorProfile: {
          select: {
            id: true,
            slug: true,
            creatorName: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'User not found',
      });
    }

    return {
      id: user.id,
      name: user.name,
      image: user.image,
      creatorProfile: user.creatorProfile
        ? {
            id: user.creatorProfile.id,
            slug: user.creatorProfile.slug,
            creatorName: user.creatorProfile.creatorName || user.name || '',
            status: user.creatorProfile.status,
          }
        : null,
      createdAt: user.createdAt,
    };
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async updateProfile(id: string, dto: UpdateUserDto) {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.image !== undefined ? { image: dto.image } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        emailVerified: true,
        status: true,
        updatedAt: true,
      },
    });
  }
}
