import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OnboardCreatorDto } from './dto/onboard-creator.dto';

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(_query?: { category?: string; search?: string }) {
    const creators = await this.prisma.creatorProfile.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        category: true,
        socialLinks: true,
      },
    });

    return creators.map((creator) => this.formatCreatorProfile(creator));
  }

  async findByUsername(username: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { username },
      include: {
        category: true,
        socialLinks: true,
        materials: {
          include: {
            material: true,
          },
        },
      },
    });

    if (!creator) {
      throw new NotFoundException(
        `Creator with username ${username} not found`,
      );
    }

    return creator;
  }

  async findByUserId(userId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: {
        category: true,
        socialLinks: true,
        materials: true,
      },
    });

    if (!creator) {
      throw new NotFoundException(`Creator profile for user not found`);
    }

    return creator;
  }

  async onboardCreator(userId: string, dto: OnboardCreatorDto) {
    const creator = await this.findByUserId(userId);

    if (dto.username && dto.username !== creator.username) {
      const existing = await this.prisma.creatorProfile.findUnique({
        where: { username: dto.username },
      });
      if (existing) {
        throw new ConflictException('Username is already taken');
      }
    }

    return this.prisma.creatorProfile.update({
      where: { id: creator.id },
      data: {
        displayName: dto.displayName,
        username: dto.username,
        bio: dto.bio,
        categoryId: dto.categoryId,
        avatarUrl: dto.avatarUrl,
        coverUrl: dto.coverUrl,
        status:
          creator.status === 'REGISTERED' ? 'PROFILE_CREATED' : creator.status,
      },
      include: {
        category: true,
        socialLinks: true,
        materials: true,
      },
    });
  }

  formatCreatorProfile(profile: any) {
    if (!profile) return profile;

    const [firstName, ...lastNameParts] = (profile.displayName || '').split(
      ' ',
    );
    const lastName = lastNameParts.join(' ');

    return {
      ...profile,
      firstName: firstName || null,
      lastName: lastName || null,
    };
  }
}
