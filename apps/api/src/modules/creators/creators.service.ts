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
import { CreateCustomMaterialDto } from './dto/create-custom-material.dto';
import { CreatorShareLinkDataDto } from './dto/share-link.dto';
import { UpdateCreatorSettingsDto } from './dto/update-creator-settings.dto';
import { UpdatePageStatusDto } from './dto/update-page-status.dto';

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

    if (!creator.materials || creator.materials.length === 0) {
      creator.materials = await this.ensureCreatorMaterials(creator.id);
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

    if (!creator.materials || creator.materials.length === 0) {
      creator.materials = await this.ensureCreatorMaterials(creator.id);
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
        materials: {
          where: { status: 'ACTIVE' },
          include: { material: true },
        },
      },
    });

    await this.ensureCreatorMaterials(profile.id);

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

    let items = await this.prisma.creatorMaterial.findMany({
      where: { creatorId: profile.id, status: 'ACTIVE' },
      include: { material: true },
      orderBy: { createdAt: 'asc' },
    });

    if (items.length === 0) {
      items = await this.ensureCreatorMaterials(profile.id);
    }

    return items.map((item) => ({
      ...item,
      name: item.material?.name || item.displayName,
      slug: item.material?.slug,
      color: item.material?.color,
      thumbnailSmallUrl: item.material?.thumbnailSmallUrl,
      thumbnailLargeUrl: item.material?.thumbnailLargeUrl,
      isCustom: Boolean(item.material?.creatorId),
    }));
  }

  async createCustomMaterial(userId: string, dto: CreateCustomMaterialDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    const baseSlug = (dto.name || 'custom')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const slug = `${profile.slug}-${baseSlug}-${randomSuffix}`;

    const primaryMat = await this.prisma.material.findFirst({
      where: { status: 'ACTIVE', creatorId: null },
    });
    const defaultPrice = primaryMat?.defaultPrice ?? 100000;
    const currency = primaryMat?.currency ?? 'NGN';

    const material = await this.prisma.material.create({
      data: {
        creatorId: profile.id,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        thumbnailSmallUrl: dto.thumbnailSmallUrl?.trim() || null,
        thumbnailLargeUrl: dto.thumbnailLargeUrl?.trim() || null,
        color: dto.color?.trim() || null,
        defaultPrice,
        currency,
        status: 'ACTIVE',
      },
    });

    const creatorMaterial = await this.prisma.creatorMaterial.create({
      data: {
        creatorId: profile.id,
        materialId: material.id,
        price: defaultPrice,
        currency,
        displayName: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: 'ACTIVE',
      },
      include: { material: true },
    });

    return {
      ...creatorMaterial,
      isCustom: true,
    };
  }

  async saveCreatorMaterials(userId: string, dto: SaveCreatorMaterialsDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    // Validate that all referenced materials exist in the catalogue (platform or owned by this creator)
    const materialIds = dto.materials.map((m) => m.materialId);
    const catalogueMaterials = await this.prisma.material.findMany({
      where: {
        id: { in: materialIds },
        status: 'ACTIVE',
        OR: [{ creatorId: null }, { creatorId: profile.id }],
      },
    });

    const foundIds = new Set(catalogueMaterials.map((m) => m.id));
    const missing = materialIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Materials not found in catalogue: ${missing.join(', ')}`,
      );
    }

    const catalogueMap = new Map(catalogueMaterials.map((c) => [c.id, c]));

    // Use a transaction: upsert each submitted material, deactivate the rest
    await this.prisma.$transaction(async (tx) => {
      // Upsert each material the creator wants active
      for (const item of dto.materials) {
        const defaultPrice =
          catalogueMap.get(item.materialId)?.defaultPrice ?? 100000;
        const price = item.price ?? defaultPrice;

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
            price,
            displayName: item.displayName || null,
            status: 'ACTIVE',
          },
          update: {
            price,
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

  // Helper to guarantee a creator always has material items available
  async ensureCreatorMaterials(profileId: string) {
    try {
      const active = await this.prisma.creatorMaterial.findMany({
        where: { creatorId: profileId, status: 'ACTIVE' },
        include: { material: true },
        orderBy: { createdAt: 'asc' },
      });

      if (active && active.length > 0) {
        return active;
      }

      const platformMaterials = await this.prisma.material.findMany({
        where: { status: 'ACTIVE', creatorId: null },
        orderBy: { createdAt: 'asc' },
      });

      if (platformMaterials && platformMaterials.length > 0) {
        for (const mat of platformMaterials) {
          await this.prisma.creatorMaterial.upsert({
            where: {
              creatorId_materialId: {
                creatorId: profileId,
                materialId: mat.id,
              },
            },
            create: {
              creatorId: profileId,
              materialId: mat.id,
              price: mat.defaultPrice,
              currency: mat.currency,
              displayName: mat.name,
              status: 'ACTIVE',
            },
            update: {
              status: 'ACTIVE',
            },
          });
        }

        return this.prisma.creatorMaterial.findMany({
          where: { creatorId: profileId, status: 'ACTIVE' },
          include: { material: true },
          orderBy: { createdAt: 'asc' },
        });
      }
    } catch (err) {
      console.warn(
        '[CreatorsService] ensureCreatorMaterials non-critical error:',
        err,
      );
    }
    return [];
  }

  // -----------------------------------------------------------
  // Supporter Settings & Page Status
  // -----------------------------------------------------------

  async updateCreatorSettings(userId: string, dto: UpdateCreatorSettingsDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    const data: Record<string, any> = {};

    // ── Appearance: theme material ──────────────────────────────────────────
    if (dto.themeMaterialId !== undefined) {
      if (dto.themeMaterialId === null) {
        data.themeMaterialId = null;
      } else {
        // Validate it's an active platform material
        const material = await this.prisma.material.findFirst({
          where: {
            id: dto.themeMaterialId,
            status: 'ACTIVE',
            creatorId: null, // platform materials only
          },
        });
        if (!material) {
          throw new BadRequestException(
            `Material with id "${dto.themeMaterialId}" not found or is not a valid platform theme.`,
          );
        }
        data.themeMaterialId = dto.themeMaterialId;
      }
    }

    // ── Supporter Interactions ──────────────────────────────────────────────
    if (dto.thankYouMessage !== undefined) {
      data.thankYouMessage = dto.thankYouMessage.trim() || null;
    }
    if (dto.showSupportersOnPage !== undefined) {
      data.showSupportersOnPage = dto.showSupportersOnPage;
    }

    const updated = await this.prisma.creatorProfile.update({
      where: { id: profile.id },
      data,
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
          where: { status: 'ACTIVE' },
          include: { material: true },
        },
        themeMaterial: true,
      },
    });

    return updated;
  }

  async updatePageStatus(userId: string, dto: UpdatePageStatusDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: {
        materials: {
          where: { status: 'ACTIVE' },
          include: { material: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    if (dto.isPublished) {
      // Validate all required setup fields before publishing
      const missingFields: string[] = [];
      if (!profile.creatorName?.trim()) missingFields.push('creatorName');
      if (!profile.slug?.trim()) missingFields.push('slug');
      if (!profile.bio?.trim()) missingFields.push('bio');
      if (!profile.avatarUrl?.trim()) missingFields.push('avatarUrl');
      if (!profile.thankYouMessage?.trim())
        missingFields.push('thankYouMessage');

      const activeMaterialsCount = profile.materials?.length || 0;
      if (activeMaterialsCount === 0) {
        missingFields.push('materials (theme)');
      }

      if (missingFields.length > 0) {
        throw new BadRequestException(
          `Cannot publish creator page. All setup fields must be completed. Missing: ${missingFields.join(', ')}`,
        );
      }
    }

    const updated = await this.prisma.creatorProfile.update({
      where: { id: profile.id },
      data: {
        isPublished: dto.isPublished,
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
        materials: {
          where: { status: 'ACTIVE' },
          include: { material: true },
        },
      },
    });

    return updated;
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
      materials: rawMaterials,
      ...cleanProfile
    } = profile;

    const materials = rawMaterials
      ? rawMaterials.map((item: any) => {
          const mat = item.material || {};
          return {
            id: item.id,
            creatorId: item.creatorId,
            materialId: item.materialId,
            price: item.price ?? mat.defaultPrice ?? 100000,
            currency: item.currency || mat.currency || 'NGN',
            displayName: item.displayName || mat.name || null,
            name: mat.name || item.displayName || '',
            slug: mat.slug || '',
            description: item.description || mat.description || null,
            color: mat.color || null,
            thumbnailSmallUrl: mat.thumbnailSmallUrl || null,
            thumbnailLargeUrl: mat.thumbnailLargeUrl || null,
            imageUrl: mat.imageUrl || null,
            status: item.status || 'ACTIVE',
            isCustom: Boolean(mat.creatorId),
            material: item.material
              ? {
                  id: mat.id,
                  name: mat.name,
                  slug: mat.slug,
                  description: mat.description,
                  iconUrl: mat.imageUrl,
                  thumbnailSmallUrl: mat.thumbnailSmallUrl,
                  thumbnailLargeUrl: mat.thumbnailLargeUrl,
                  color: mat.color,
                  basePrice: mat.defaultPrice,
                  status: mat.status,
                }
              : undefined,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          };
        })
      : [];

    const isPublished = Boolean(profile.isPublished);

    return {
      ...cleanProfile,
      creatorName,
      slug: cleanSlug,
      materials,
      showSupportersOnPage: profile.showSupportersOnPage ?? true,
      isPublished,
    };
  }

  // -----------------------------------------------------------
  // Share Link & QR Code (Engineer 1)
  // -----------------------------------------------------------

  async getShareLink(userId: string): Promise<CreatorShareLinkDataDto> {
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: {
        materials: {
          where: { status: 'ACTIVE' },
          include: { material: true },
        },
      },
    });

    if (!creator) {
      throw new NotFoundException('Creator profile not found');
    }

    return this.buildShareLink(creator);
  }

  async getShareLinkBySlug(slug: string): Promise<CreatorShareLinkDataDto> {
    const cleanSlug = slug.replace(/^@/, '').toLowerCase().trim();
    const creator = await this.prisma.creatorProfile.findUnique({
      where: { slug: cleanSlug },
      include: {
        materials: {
          where: { status: 'ACTIVE' },
          include: { material: true },
        },
      },
    });

    if (!creator) {
      throw new NotFoundException(`Creator with slug "${slug}" not found`);
    }

    return this.buildShareLink(creator);
  }

  private buildShareLink(creator: any): CreatorShareLinkDataDto {
    const baseUrl = (
      process.env.CREATOR_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      'https://buymeayard.com'
    ).replace(/\/+$/, '');
    const cleanSlug = (creator.slug || '')
      .replace(/^@/, '')
      .toLowerCase()
      .trim();
    const publicUrl = `${baseUrl}/${cleanSlug}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(publicUrl)}`;

    const materialNames = (creator.materials || [])
      .map((m: any) => m.displayName || m.material?.name)
      .filter(Boolean);

    let materialsDescription = 'Ankara, Lace, or Aso-oke';
    if (materialNames.length === 1) {
      materialsDescription = materialNames[0];
    } else if (materialNames.length === 2) {
      materialsDescription = `${materialNames[0]} or ${materialNames[1]}`;
    } else if (materialNames.length > 2) {
      materialsDescription = `${materialNames.slice(0, -1).join(', ')}, or ${materialNames[materialNames.length - 1]}`;
    }

    const shareText = `Support my creative work on Buy Me a Yard! Send me a yard of ${materialsDescription}: ${publicUrl}`;

    return {
      publicUrl,
      slug: cleanSlug,
      qrCodeUrl,
      shareText,
      socialLinks: {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
        whatsapp: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(publicUrl)}&text=${encodeURIComponent(shareText)}`,
      },
    };
  }
}
