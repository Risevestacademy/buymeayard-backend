import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../../infrastructure/storage/storage-provider.interface';
import { OnboardCreatorDto } from './dto/onboard-creator.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveCreatorMaterialsDto } from './dto/save-creator-materials.dto';

@Injectable()
export class CreatorsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  async findAll(_query?: { search?: string }) {
    const where: any = {
      status: 'ACTIVE',
    };

    if (_query?.search) {
      where.OR = [
        { creatorName: { contains: _query.search, mode: 'insensitive' } },
        { user: { name: { contains: _query.search, mode: 'insensitive' } } },
        { slug: { contains: _query.search, mode: 'insensitive' } },
      ];
    }

    const creators = await this.prisma.creatorProfile.findMany({
      where,
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
      },
    });

    return creators.map((creator) => this.formatCreatorProfile(creator));
  }

  async findBySlug(slug: string) {
    const cleanSlug = slug
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^(buymeayard\/|\/|@)/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim();

    const creator = await this.prisma.creatorProfile.findUnique({
      where: { slug: cleanSlug },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        socialLinks: true,
        materials: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            material: true,
          },
        },
      },
    });

    if (!creator) {
      throw new NotFoundException(
        `Creator with identifier "${slug}" not found`,
      );
    }

    return creator;
  }

  // Alias for backward compatibility
  async findByUsername(identifier: string) {
    return this.findBySlug(identifier);
  }

  public static readonly RESERVED_SLUGS = new Set([
    'admin',
    'administrator',
    'api',
    'app',
    'audience',
    'auth',
    'balance',
    'billing',
    'buymeayard',
    'callback',
    'checkout',
    'contact',
    'create',
    'creator',
    'creators',
    'dashboard',
    'docs',
    'explore',
    'feed',
    'following',
    'forgot-password',
    'help',
    'home',
    'kyc',
    'legal',
    'login',
    'logout',
    'materials',
    'media',
    'messages',
    'moderation',
    'notifications',
    'onboarding',
    'payout',
    'payouts',
    'posts',
    'pricing',
    'privacy',
    'profile',
    'register',
    'reset-password',
    'revenue',
    'search',
    'settings',
    'signin',
    'signout',
    'signup',
    'slug',
    'status',
    'support',
    'supporters',
    'supports',
    'terms',
    'users',
    'verify',
    'webhook',
    'webhooks',
    'yard',
    'yards',
    'null',
    'undefined',
  ]);

  async checkSlugAvailability(
    rawSlug: string,
    currentUserId?: string,
  ): Promise<{
    available: boolean;
    slug: string;
    reason?: string;
    message?: string;
    isCurrent?: boolean;
  }> {
    if (!rawSlug || typeof rawSlug !== 'string' || !rawSlug.trim()) {
      return {
        available: false,
        slug: '',
        reason: 'Handle cannot be empty',
      };
    }

    const cleanSlug = rawSlug
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^(buymeayard\/|\/|@)/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim();

    if (!cleanSlug) {
      return {
        available: false,
        slug: '',
        reason: 'Handle cannot be empty',
      };
    }

    if (cleanSlug.length < 3) {
      return {
        available: false,
        slug: cleanSlug,
        reason: 'Handle must be at least 3 characters long',
      };
    }

    if (cleanSlug.length > 30) {
      return {
        available: false,
        slug: cleanSlug,
        reason: 'Handle cannot exceed 30 characters',
      };
    }

    if (!/^[a-z0-9_-]+$/.test(cleanSlug)) {
      return {
        available: false,
        slug: cleanSlug,
        reason:
          'Handle can only contain letters, numbers, hyphens, and underscores',
      };
    }

    if (CreatorsService.RESERVED_SLUGS.has(cleanSlug)) {
      return {
        available: false,
        slug: cleanSlug,
        reason: 'This handle is reserved and cannot be used',
      };
    }

    const existing = await this.prisma.creatorProfile.findUnique({
      where: { slug: cleanSlug },
    });

    if (existing) {
      if (currentUserId && existing.userId === currentUserId) {
        return {
          available: true,
          slug: cleanSlug,
          isCurrent: true,
          message: 'This is your current handle',
        };
      }
      return {
        available: false,
        slug: cleanSlug,
        reason: 'This handle is already taken',
      };
    }

    return {
      available: true,
      slug: cleanSlug,
      message: 'Handle is available',
    };
  }

  async findByUserId(userId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
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
        materials: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            material: true,
          },
        },
      },
    });

    if (!creator) {
      throw new NotFoundException(`Creator profile for user not found`);
    }

    return creator;
  }

  async onboardCreator(userId: string, dto: OnboardCreatorDto) {
    // 1. Resolve Creator Name
    const creatorName = (
      dto.creatorName ||
      (dto as any).displayName ||
      ''
    ).trim();
    if (!creatorName) {
      throw new BadRequestException('Creator name is required');
    }

    // 2. Resolve Slug
    const rawSlug = (dto.slug || '').trim();
    if (!rawSlug) {
      throw new BadRequestException('Slug is required');
    }

    const cleanSlug = rawSlug
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^(buymeayard\/|\/|@)/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim();

    if (!cleanSlug || !/^[a-z0-9_-]+$/.test(cleanSlug)) {
      throw new BadRequestException(
        'Slug contains invalid characters. Use letters, numbers, hyphens, and underscores only.',
      );
    }

    if (cleanSlug.length < 3) {
      throw new BadRequestException('Slug must be at least 3 characters long');
    }

    if (cleanSlug.length > 30) {
      throw new BadRequestException('Slug cannot exceed 30 characters');
    }

    if (CreatorsService.RESERVED_SLUGS.has(cleanSlug)) {
      throw new BadRequestException('This slug is reserved and cannot be used');
    }

    // 3. Ensure uniqueness
    const existingTaken = await this.prisma.creatorProfile.findUnique({
      where: { slug: cleanSlug },
    });

    if (existingTaken && existingTaken.userId !== userId) {
      throw new ConflictException('Slug is already taken');
    }

    // 4. Update User name
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: creatorName },
    });

    // 5. Create or update profile
    const existingProfile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    let profile;

    if (existingProfile) {
      profile = await this.prisma.creatorProfile.update({
        where: { id: existingProfile.id },
        data: {
          creatorName,
          slug: cleanSlug,
          status:
            existingProfile.status === 'REGISTERED'
              ? 'PROFILE_CREATED'
              : existingProfile.status,
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
          creatorName,
          slug: cleanSlug,
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
      console.warn(
        '[CreatorsService] Failed to auto-sync OAuth social accounts:',
        err,
      );
    }

    // Return refreshed profile with socialLinks and materials
    const updated = await this.prisma.creatorProfile.findUnique({
      where: { id: profile.id },
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

    return this.formatCreatorProfile(updated);
  }

  // -----------------------------------------------------------
  // Profile Update (post-onboarding edits)
  // -----------------------------------------------------------

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    const data: Record<string, any> = {};

    if (dto.creatorName !== undefined) {
      const name = dto.creatorName.trim();
      if (!name) {
        throw new BadRequestException('Creator name cannot be empty');
      }
      data.creatorName = name;

      // Keep the user.name in sync
      await this.prisma.user.update({
        where: { id: userId },
        data: { name },
      });
    }

    if (dto.bio !== undefined) {
      const bio = dto.bio.trim();
      if (bio.length > 160) {
        throw new BadRequestException('Bio cannot exceed 160 characters');
      }
      data.bio = bio || null;
    }

    if (Object.keys(data).length === 0) {
      return this.findByUserId(userId);
    }

    await this.prisma.creatorProfile.update({
      where: { id: profile.id },
      data,
    });

    return this.findByUserId(userId);
  }

  // -----------------------------------------------------------
  // Avatar Upload
  // -----------------------------------------------------------

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    const result = await this.storage.uploadFile(file.buffer, {
      folder: 'avatars',
      publicId: `creator-${profile.id}`,
      resourceType: 'image',
    });

    await this.prisma.creatorProfile.update({
      where: { id: profile.id },
      data: { avatarUrl: result.secureUrl },
    });

    return {
      avatarUrl: result.secureUrl,
    };
  }

  // -----------------------------------------------------------
  // Creator Materials (Yard Menu)
  // -----------------------------------------------------------

  async getCreatorMaterials(userId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    return this.prisma.creatorMaterial.findMany({
      where: { creatorId: profile.id, status: 'ACTIVE' },
      include: { material: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async saveCreatorMaterials(userId: string, dto: SaveCreatorMaterialsDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    // Validate that all referenced materials exist in the platform catalogue
    const materialIds = dto.materials.map((m) => m.materialId);
    const catalogueMaterials = await this.prisma.material.findMany({
      where: { id: { in: materialIds }, status: 'ACTIVE' },
    });

    const foundIds = new Set(catalogueMaterials.map((m) => m.id));
    const missing = materialIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Materials not found in catalogue: ${missing.join(', ')}`,
      );
    }

    // Use a transaction: upsert each submitted material, deactivate the rest
    await this.prisma.$transaction(async (tx) => {
      // Upsert each material the creator wants active
      for (const item of dto.materials) {
        await tx.creatorMaterial.upsert({
          where: {
            creatorId_materialId: {
              creatorId: profile.id,
              materialId: item.materialId,
            },
          },
          create: {
            creatorId: profile.id,
            materialId: item.materialId,
            price: item.price,
            displayName: item.displayName || null,
            status: 'ACTIVE',
          },
          update: {
            price: item.price,
            displayName: item.displayName || null,
            status: 'ACTIVE',
          },
        });
      }

      // Deactivate any materials the creator did not include
      if (materialIds.length > 0) {
        await tx.creatorMaterial.updateMany({
          where: {
            creatorId: profile.id,
            materialId: { notIn: materialIds },
            status: 'ACTIVE',
          },
          data: { status: 'INACTIVE' },
        });
      }
    });

    // Return the updated menu
    return this.prisma.creatorMaterial.findMany({
      where: { creatorId: profile.id, status: 'ACTIVE' },
      include: { material: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  formatCreatorProfile(profile: any) {
    if (!profile) return profile;

    const creatorName =
      profile.creatorName || profile.user?.name || profile.name || '';
    const rawSlug = profile.slug || '';
    const cleanSlug = rawSlug
      .replace(/^https?:\/\/[^/]+\//i, '')
      .replace(/^(buymeayard\/|\/|@)/i, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .trim();

    // Strip redundant and confusing duplicate name and link fields
    const {
      name: _name,
      displayName: _displayName,
      firstName: _firstName,
      lastName: _lastName,
      username: _username,
      personalizedLink: _personalizedLink,
      ...cleanProfile
    } = profile;

    return {
      ...cleanProfile,
      creatorName,
      slug: cleanSlug,
    };
  }
}
