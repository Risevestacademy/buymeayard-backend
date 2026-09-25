import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { OnboardCreatorDto } from './dto/onboard-creator.dto';

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(_query?: { search?: string }) {
    const where: any = {
      status: 'ACTIVE',
    };

    if (_query?.search) {
      where.OR = [
        { displayName: { contains: _query.search, mode: 'insensitive' } },
        { username: { contains: _query.search, mode: 'insensitive' } },
        { personalizedLink: { contains: _query.search, mode: 'insensitive' } },
      ];
    }

    const creators = await this.prisma.creatorProfile.findMany({
      where,
      include: {
        socialLinks: true,
      },
    });

    return creators.map((creator) => this.formatCreatorProfile(creator));
  }

  async findByUsername(usernameOrLink: string) {
    const cleanSlug = usernameOrLink
      .replace(/^https?:\/\/[^\/]+\//i, '')
      .replace(/^(buymeayard\/|\/|@)/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim();

    const formattedLink = `buymeayard/${cleanSlug}`;

    const creator = await this.prisma.creatorProfile.findFirst({
      where: {
        OR: [
          { username: cleanSlug },
          { personalizedLink: formattedLink },
          { personalizedLink: usernameOrLink },
        ],
      },
      include: {
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
        `Creator with identifier "${usernameOrLink}" not found`,
      );
    }

    return creator;
  }

  async findByUserId(userId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: {
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
    // 1. Resolve Creator Name
    const creatorName = (dto.creatorName || dto.displayName || '').trim();
    if (!creatorName) {
      throw new BadRequestException('Creator name is required');
    }

    // 2. Resolve Personalized Link & Slug
    const rawLink = (dto.personalizedLink || dto.username || '').trim();
    if (!rawLink) {
      throw new BadRequestException('Personalized link is required');
    }

    const cleanSlug = rawLink
      .replace(/^https?:\/\/[^\/]+\//i, '')
      .replace(/^(buymeayard\/|\/|@)/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim();

    if (!cleanSlug || !/^[a-z0-9_-]+$/.test(cleanSlug)) {
      throw new BadRequestException(
        'Personalized link contains invalid characters. Use letters, numbers, hyphens, and underscores only.',
      );
    }

    const formattedPersonalizedLink = `buymeayard/${cleanSlug}`;

    // 3. Ensure uniqueness
    const existingTaken = await this.prisma.creatorProfile.findFirst({
      where: {
        OR: [
          { username: cleanSlug },
          { personalizedLink: formattedPersonalizedLink },
          { personalizedLink: cleanSlug },
        ],
      },
    });

    if (existingTaken && existingTaken.userId !== userId) {
      throw new ConflictException(
        'Personalized link / username is already taken',
      );
    }

    // 4. Create or update profile
    const existingProfile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    let profile;

    if (existingProfile) {
      profile = await this.prisma.creatorProfile.update({
        where: { id: existingProfile.id },
        data: {
          displayName: creatorName,
          username: cleanSlug,
          personalizedLink: formattedPersonalizedLink,
          status:
            existingProfile.status === 'REGISTERED'
              ? 'PROFILE_CREATED'
              : existingProfile.status,
        },
        include: {
          socialLinks: true,
          materials: true,
        },
      });
    } else {
      const role = await this.prisma.role.upsert({
        where: { name: 'CREATOR' },
        update: {},
        create: { name: 'CREATOR' },
      });

      await this.prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id },
      });

      profile = await this.prisma.creatorProfile.create({
        data: {
          userId,
          username: cleanSlug,
          displayName: creatorName,
          personalizedLink: formattedPersonalizedLink,
          status: 'PROFILE_CREATED',
          kycStatus: 'NOT_SUBMITTED',
        },
        include: {
          socialLinks: true,
          materials: true,
        },
      });
    }

    // 5. Sync social links if passed in DTO
    if (dto.socialLinks && dto.socialLinks.length > 0) {
      for (const link of dto.socialLinks) {
        if (link.platform && link.url) {
          const platform = link.platform.toLowerCase().trim();
          const existing = await this.prisma.creatorSocialLink.findFirst({
            where: { creatorId: profile.id, platform },
          });

          if (existing) {
            await this.prisma.creatorSocialLink.update({
              where: { id: existing.id },
              data: { url: link.url.trim() },
            });
          } else {
            await this.prisma.creatorSocialLink.create({
              data: {
                creatorId: profile.id,
                platform,
                url: link.url.trim(),
              },
            });
          }
        }
      }
    }

    // 6. Also sync any OAuth social accounts connected via Better Auth
    try {
      const authAccounts = await this.prisma.authAccount.findMany({
        where: {
          userId,
          providerId: { notIn: ['credential', 'email'] },
        },
      });

      for (const acc of authAccounts) {
        let url = '';
        const provider = acc.providerId.toLowerCase();
        switch (provider) {
          case 'twitter':
            url = `https://x.com/intent/user?user_id=${acc.accountId}`;
            break;
          case 'facebook':
            url = `https://facebook.com/${acc.accountId}`;
            break;
          case 'instagram':
            url = `https://instagram.com/${acc.accountId}`;
            break;
          case 'tiktok':
            url = `https://tiktok.com/@${acc.accountId}`;
            break;
          case 'youtube':
            url = `https://youtube.com/channel/${acc.accountId}`;
            break;
          default:
            if (provider !== 'google' && provider !== 'apple') {
              url = `https://${provider}.com/${acc.accountId}`;
            }
        }

        if (url) {
          const existing = await this.prisma.creatorSocialLink.findFirst({
            where: { creatorId: profile.id, platform: provider },
          });

          if (!existing) {
            await this.prisma.creatorSocialLink.create({
              data: {
                creatorId: profile.id,
                platform: provider,
                url,
              },
            });
          }
        }
      }
    } catch (err) {
      // Non-critical background sync
      console.warn('[CreatorsService] Failed to auto-sync OAuth social accounts:', err);
    }

    // Return refreshed profile with socialLinks and materials
    return this.prisma.creatorProfile.findUnique({
      where: { id: profile.id },
      include: {
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
      creatorName: profile.displayName,
      personalizedLink:
        profile.personalizedLink ||
        (profile.username ? `buymeayard/${profile.username}` : null),
      firstName: firstName || null,
      lastName: lastName || null,
    };
  }
}
