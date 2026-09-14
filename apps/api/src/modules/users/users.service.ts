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
            username: true,
            displayName: true,
            status: true,
            kycStatus: true,
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
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      status: user.status,
      roles: user.roles.map((r) => r.role.name),
      creatorProfile: user.creatorProfile,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
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
