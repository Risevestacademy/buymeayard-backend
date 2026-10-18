jest.mock('../../common/guards/auth.guard', () => ({
  AuthGuard: class {
    canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      req.user = {
        id: 'user-uuid-1',
        name: 'Adeola Johnson',
        email: 'adeola@example.com',
      };
      return true;
    }
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';
import { Reflector } from '@nestjs/core';

describe('Creators Endpoints (HTTP Integration)', () => {
  let app: INestApplication;
  let creatorsService: {
    findAll: jest.Mock;
    findByUserId: jest.Mock;
    findBySlug: jest.Mock;
    onboardCreator: jest.Mock;
    checkSlugAvailability: jest.Mock;
    updateProfile: jest.Mock;
    uploadAvatar: jest.Mock;
    getCreatorMaterials: jest.Mock;
    saveCreatorMaterials: jest.Mock;
    getShareLink: jest.Mock;
    getShareLinkBySlug: jest.Mock;
    formatCreatorProfile: jest.Mock;
    getDashboardOverview: jest.Mock;
    getDashboardBalance: jest.Mock;
    getDashboardEarnings: jest.Mock;
    getDashboardContributions: jest.Mock;
    getDashboardMetrics: jest.Mock;
    getDashboardRecentContributions: jest.Mock;
  };

  const mockUser = {
    id: 'user-uuid-1',
    name: 'Adeola Johnson',
    email: 'adeola@example.com',
  };

  const mockCreatorProfile = {
    id: 'creator-uuid-1',
    userId: mockUser.id,
    creatorName: 'Adeola Johnson',
    slug: 'adeola',
    bio: 'Lifestyle creator in Lagos',
    avatarUrl: 'https://cdn.buymeayard.com/avatars/adeola.jpg',
    status: 'PROFILE_CREATED',
    kycStatus: 'NOT_SUBMITTED',
    socialLinks: [],
    materials: [
      {
        id: 'cm-1',
        creatorId: 'creator-uuid-1',
        materialId: 'mat-1',
        price: 500000,
        displayName: 'My Ankara',
        status: 'ACTIVE',
        material: {
          id: 'mat-1',
          name: 'Ankara',
          slug: 'ankara',
          basePrice: 500000,
        },
      },
    ],
  };

  beforeAll(async () => {
    creatorsService = {
      findAll: jest.fn(),
      findByUserId: jest.fn().mockResolvedValue(mockCreatorProfile),
      findBySlug: jest.fn().mockImplementation((slug: string) => {
        if (slug === 'adeola') return Promise.resolve(mockCreatorProfile);
        throw new NotFoundException(
          `Creator with identifier "${slug}" not found`,
        );
      }),
      onboardCreator: jest.fn(),
      checkSlugAvailability: jest.fn().mockResolvedValue({
        available: true,
        slug: 'newcreator',
        message: 'Handle is available',
      }),
      updateProfile: jest.fn().mockResolvedValue({
        ...mockCreatorProfile,
        creatorName: 'Adeola Updated',
        bio: 'Updated bio text',
      }),
      uploadAvatar: jest.fn().mockResolvedValue({
        avatarUrl:
          'https://res.cloudinary.com/buymeayard/avatars/creator-uuid-1.jpg',
      }),
      getCreatorMaterials: jest
        .fn()
        .mockResolvedValue(mockCreatorProfile.materials),
      saveCreatorMaterials: jest.fn().mockImplementation((_userId, dto) => {
        return Promise.resolve(
          dto.materials.map((m: any, idx: number) => ({
            id: `cm-${idx + 1}`,
            creatorId: mockCreatorProfile.id,
            materialId: m.materialId,
            price: m.price,
            displayName: m.displayName || null,
            status: 'ACTIVE',
          })),
        );
      }),
      getShareLink: jest.fn(async (userId: string) => {
        if (userId !== mockUser.id) throw new NotFoundException();
        return {
          publicUrl: 'https://buymeayard.com/adeola',
          slug: 'adeola',
          qrCodeUrl:
            'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fbuymeayard.com%2Fadeola',
          shareText:
            'Support my creative work on Buy Me a Yard! Send me a yard of Ankara: https://buymeayard.com/adeola',
          socialLinks: {
            twitter: 'https://twitter.com/intent/tweet?text=...',
            whatsapp: 'https://api.whatsapp.com/send?text=...',
            facebook: 'https://www.facebook.com/sharer/sharer.php?u=...',
            linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=...',
            telegram: 'https://t.me/share/url?url=...',
          },
        };
      }),
      getShareLinkBySlug: jest.fn(async (slug: string) => {
        if (slug !== 'adeola') throw new NotFoundException();
        return {
          publicUrl: 'https://buymeayard.com/adeola',
          slug: 'adeola',
          qrCodeUrl:
            'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https%3A%2F%2Fbuymeayard.com%2Fadeola',
          shareText:
            'Support my creative work on Buy Me a Yard! Send me a yard of Ankara: https://buymeayard.com/adeola',
          socialLinks: {
            twitter: 'https://twitter.com/intent/tweet?text=...',
            whatsapp: 'https://api.whatsapp.com/send?text=...',
            facebook: 'https://www.facebook.com/sharer/sharer.php?u=...',
            linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=...',
            telegram: 'https://t.me/share/url?url=...',
          },
        };
      }),
      formatCreatorProfile: jest.fn((p) => {
        if (!p) return p;
        const {
          name: _name,
          displayName: _displayName,
          firstName: _firstName,
          lastName: _lastName,
          username: _username,
          personalizedLink: _personalizedLink,
          ...clean
        } = p;
        return {
          ...clean,
          creatorName: p.creatorName || p.user?.name || '',
          slug: p.slug || p.username || '',
          material: p.materials?.[0] || null,
        };
      }),
      getDashboardOverview: jest.fn().mockResolvedValue({
        creator: {
          id: 'creator-uuid-1',
          creatorName: 'Adeola Johnson',
          slug: 'adeola',
          avatarUrl: 'https://cdn.buymeayard.com/avatars/adeola.jpg',
          status: 'ACTIVE',
          isPublished: true,
          pageStatus: 'LIVE',
          pageStatusLabel: 'Page is live',
          publicUrl: 'https://buymeayard.com/adeola',
        },
        metrics: {
          totalContributions: 24,
          totalContributionAmount: 12000000,
          netEarnings: 11400000,
          platformFees: 600000,
          currency: 'NGN',
        },
        balance: {
          availableBalance: 9800000,
          pendingBalance: 1600000,
          withdrawnToDate: 0,
          currency: 'NGN',
          canWithdraw: true,
          kycStatus: 'VERIFIED',
          hasPayoutMethod: true,
        },
        recentContributions: [
          {
            id: 'sup-1',
            supporter: {
              id: 'user-s1',
              name: 'Ada Okafor',
              initials: 'AO',
              avatarUrl: null,
              isAnonymous: false,
            },
            material: {
              name: 'Ankara',
              color: '#E05A47',
              thumbnailUrl: 'https://cdn.example.com/ankara.jpg',
              quantity: 2,
            },
            message: 'Keep making great content!',
            amount: 1000000,
            creatorAmount: 950000,
            currency: 'NGN',
            createdAt: '2026-10-06T08:00:00.000Z',
          },
        ],
        earningsChart: {
          period: '30d',
          totalGross: 12000000,
          totalFees: 600000,
          totalNet: 11400000,
          currency: 'NGN',
          dataPoints: [
            {
              date: '2026-10-06',
              label: 'Oct 6',
              grossAmount: 1000000,
              netAmount: 950000,
              contributionsCount: 1,
            },
          ],
        },
      }),
      getDashboardBalance: jest.fn().mockResolvedValue({
        availableBalance: 9800000,
        pendingBalance: 1600000,
        withdrawnToDate: 0,
        currency: 'NGN',
        canWithdraw: true,
        kycStatus: 'VERIFIED',
        hasPayoutMethod: true,
      }),
      getDashboardEarnings: jest.fn().mockResolvedValue({
        period: '30d',
        totalGross: 12000000,
        totalFees: 600000,
        totalNet: 11400000,
        currency: 'NGN',
        dataPoints: [],
      }),
      getDashboardContributions: jest.fn().mockResolvedValue({
        data: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 1 },
      }),
      getDashboardMetrics: jest.fn().mockResolvedValue({
        totalContributions: 24,
        totalContributionAmount: 12000000,
        netEarnings: 11400000,
        platformFees: 600000,
        currency: 'NGN',
      }),
      getDashboardRecentContributions: jest.fn().mockResolvedValue([
        {
          id: 'sup-1',
          supporter: { name: 'Ada Okafor', initials: 'AO' },
          amount: 500000,
        },
      ]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CreatorsController],
      providers: [
        { provide: CreatorsService, useValue: creatorsService },
        Reflector,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use((req: any, _res: any, next: any) => {
      req.user = mockUser;
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /creators/me/materials', () => {
    it('should return 200 with the creator materials list', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/materials')
        .expect(200);

      expect(creatorsService.getCreatorMaterials).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body[0]).toHaveProperty('materialId', 'mat-1');
      expect(response.body[0]).toHaveProperty('price', 500000);
      expect(response.body[0]).toHaveProperty('material');
    });
  });

  describe('PUT /creators/me/materials', () => {
    it('should return 200 when saving valid materials menu', async () => {
      const payload = {
        materials: [
          {
            materialId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            price: 600000,
            displayName: 'Special Ankara',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .put('/creators/me/materials')
        .send(payload)
        .expect(200);

      expect(creatorsService.saveCreatorMaterials).toHaveBeenCalledWith(
        mockUser.id,
        payload,
      );
      expect(response.body).toHaveLength(1);
      expect(response.body[0].price).toBe(600000);
    });

    it('should return 400 when materialId is not a valid UUID', async () => {
      const invalidPayload = {
        materials: [
          {
            materialId: 'not-a-uuid',
            price: 500000,
          },
        ],
      };

      await request(app.getHttpServer())
        .put('/creators/me/materials')
        .send(invalidPayload)
        .expect(400);
    });

    it('should return 400 when price is less than minimum allowed (100 kobo)', async () => {
      const invalidPayload = {
        materials: [
          {
            materialId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            price: 50, // below 100 kobo minimum
          },
        ],
      };

      await request(app.getHttpServer())
        .put('/creators/me/materials')
        .send(invalidPayload)
        .expect(400);
    });
  });

  describe('PUT /creators/me/profile', () => {
    it('should return 200 when updating creator name and bio', async () => {
      const payload = {
        creatorName: 'Adeola Updated',
        bio: 'Updated bio text',
      };

      const response = await request(app.getHttpServer())
        .put('/creators/me/profile')
        .send(payload)
        .expect(200);

      expect(creatorsService.updateProfile).toHaveBeenCalledWith(
        mockUser.id,
        payload,
      );
      expect(response.body).toHaveProperty('creatorName', 'Adeola Updated');
      expect(response.body).toHaveProperty('bio', 'Updated bio text');
    });

    it('should return 400 when non-whitelisted fields are provided', async () => {
      const payload = {
        creatorName: 'Adeola Updated',
        unauthorizedField: 'malicious-data',
      };

      await request(app.getHttpServer())
        .put('/creators/me/profile')
        .send(payload)
        .expect(400);
    });
  });

  describe('POST /creators/me/avatar', () => {
    it('should return 201 with avatarUrl when uploading valid PNG image', async () => {
      // 1x1 valid transparent PNG buffer
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );

      const response = await request(app.getHttpServer())
        .post('/creators/me/avatar')
        .attach('file', pngBuffer, {
          filename: 'avatar.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(creatorsService.uploadAvatar).toHaveBeenCalled();
      expect(response.body).toHaveProperty(
        'avatarUrl',
        'https://res.cloudinary.com/buymeayard/avatars/creator-uuid-1.jpg',
      );
    });

    it('should return 400 when uploading an invalid file format (text/plain)', async () => {
      const textBuffer = Buffer.from('hello world not an image');

      await request(app.getHttpServer())
        .post('/creators/me/avatar')
        .attach('file', textBuffer, {
          filename: 'doc.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });
  });

  describe('GET /creators/check-slug', () => {
    it('should return 200 with slug availability', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/check-slug?slug=newcreator')
        .expect(200);

      expect(creatorsService.checkSlugAvailability).toHaveBeenCalledWith(
        'newcreator',
        mockUser.id,
      );
      expect(response.body).toHaveProperty('available', true);
    });
  });

  describe('GET /creators/:slug', () => {
    it('should return 200 with public creator profile and active materials', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/adeola')
        .expect(200);

      expect(creatorsService.findBySlug).toHaveBeenCalledWith('adeola');
      expect(response.body).toHaveProperty('slug', 'adeola');
      expect(response.body).toHaveProperty('materials');
      expect(response.body.materials).toHaveLength(1);
      expect(response.body).toHaveProperty('material');
      expect(response.body.material).toHaveProperty('id', 'cm-1');
      expect(response.body.material).toHaveProperty('displayName', 'My Ankara');
    });

    it('should return 404 when creator slug does not exist', async () => {
      await request(app.getHttpServer())
        .get('/creators/nonexistent')
        .expect(404);
    });
  });

  describe('GET /creators/me/share-link', () => {
    it('should return 200 with creator share link metadata and QR code', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/share-link')
        .expect(200);

      expect(creatorsService.getShareLink).toHaveBeenCalledWith(mockUser.id);
      expect(response.body).toHaveProperty(
        'publicUrl',
        'https://buymeayard.com/adeola',
      );
      expect(response.body).toHaveProperty('slug', 'adeola');
      expect(response.body).toHaveProperty('qrCodeUrl');
      expect(response.body).toHaveProperty('shareText');
      expect(response.body).toHaveProperty('socialLinks');
      expect(response.body.socialLinks).toHaveProperty('twitter');
      expect(response.body.socialLinks).toHaveProperty('whatsapp');
    });
  });

  describe('GET /creators/:slug/share-link', () => {
    it('should return 200 with public share link metadata by slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/adeola/share-link')
        .expect(200);

      expect(creatorsService.getShareLinkBySlug).toHaveBeenCalledWith('adeola');
      expect(response.body).toHaveProperty(
        'publicUrl',
        'https://buymeayard.com/adeola',
      );
      expect(response.body).toHaveProperty('slug', 'adeola');
      expect(response.body).toHaveProperty('qrCodeUrl');
      expect(response.body).toHaveProperty('shareText');
      expect(response.body).toHaveProperty('socialLinks');
    });

    it('should return 404 when creator slug does not exist', async () => {
      await request(app.getHttpServer())
        .get('/creators/nonexistent/share-link')
        .expect(404);
    });
  });

  describe('GET /creators/me/dashboard', () => {
    it('should return 200 with full creator dashboard overview', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/dashboard?period=30d')
        .expect(200);

      expect(creatorsService.getDashboardOverview).toHaveBeenCalledWith(
        mockUser.id,
        '30d',
      );
      expect(response.body).toHaveProperty('creator');
      expect(response.body.creator).toHaveProperty(
        'creatorName',
        'Adeola Johnson',
      );
      expect(response.body.creator).toHaveProperty('pageStatus', 'LIVE');
      expect(response.body).toHaveProperty('metrics');
      expect(response.body.metrics).toHaveProperty('totalContributions', 24);
      expect(response.body.metrics).toHaveProperty(
        'totalContributionAmount',
        12000000,
      );
      expect(response.body).toHaveProperty('balance');
      expect(response.body.balance).toHaveProperty('availableBalance', 9800000);
      expect(response.body.balance).toHaveProperty('canWithdraw', true);
      expect(response.body).toHaveProperty('recentContributions');
      expect(response.body.recentContributions).toHaveLength(1);
      expect(response.body.recentContributions[0].supporter).toHaveProperty(
        'initials',
        'AO',
      );
      expect(response.body).toHaveProperty('earningsChart');
      expect(response.body.earningsChart).toHaveProperty('period', '30d');
    });
  });

  describe('GET /creators/me/overview', () => {
    it('should alias to dashboard and return 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/overview')
        .expect(200);

      expect(creatorsService.getDashboardOverview).toHaveBeenCalledWith(
        mockUser.id,
        undefined,
      );
      expect(response.body).toHaveProperty('creator');
      expect(response.body).toHaveProperty('metrics');
    });
  });

  describe('GET /creators/me/dashboard/earnings', () => {
    it('should return 200 with earnings chart', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/dashboard/earnings?period=30d')
        .expect(200);

      expect(creatorsService.getDashboardEarnings).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ period: '30d' }),
      );
      expect(response.body).toHaveProperty('period', '30d');
      expect(response.body).toHaveProperty('totalGross', 12000000);
    });
  });

  describe('GET /creators/me/dashboard/contributions', () => {
    it('should return 200 with paginated contributions', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/dashboard/contributions?page=1&limit=10')
        .expect(200);

      expect(creatorsService.getDashboardContributions).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ page: 1, limit: 10 }),
      );
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });
  });

  describe('GET /creators/me/dashboard/balance', () => {
    it('should return 200 with balance breakdown', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/dashboard/balance')
        .expect(200);

      expect(creatorsService.getDashboardBalance).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(response.body).toHaveProperty('availableBalance', 9800000);
      expect(response.body).toHaveProperty('canWithdraw', true);
    });
  });

  describe('GET /creators/me/dashboard/metrics and /creators/me/metrics', () => {
    it('should return 200 with creator summary KPI metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/dashboard/metrics')
        .expect(200);

      expect(creatorsService.getDashboardMetrics).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(response.body).toHaveProperty('totalContributions', 24);
      expect(response.body).toHaveProperty('totalContributionAmount', 12000000);
      expect(response.body).toHaveProperty('netEarnings', 11400000);

      const aliasResponse = await request(app.getHttpServer())
        .get('/creators/me/metrics')
        .expect(200);

      expect(aliasResponse.body).toHaveProperty('totalContributions', 24);
    });
  });

  describe('GET /creators/me/dashboard/recent-contributions and /creators/me/recent-contributions', () => {
    it('should return 200 with recent contributions list', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/dashboard/recent-contributions?limit=5')
        .expect(200);

      expect(
        creatorsService.getDashboardRecentContributions,
      ).toHaveBeenCalledWith(mockUser.id, 5);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0]).toHaveProperty('id', 'sup-1');

      const aliasResponse = await request(app.getHttpServer())
        .get('/creators/me/recent-contributions?limit=5')
        .expect(200);

      expect(Array.isArray(aliasResponse.body)).toBe(true);
    });
  });

  describe('GET /creators/me/balance and /creators/me/analytics/earnings aliases', () => {
    it('should route /creators/me/balance to balance endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/balance')
        .expect(200);

      expect(creatorsService.getDashboardBalance).toHaveBeenCalledWith(
        mockUser.id,
      );
      expect(response.body).toHaveProperty('availableBalance', 9800000);
    });

    it('should route /creators/me/analytics/earnings to earnings endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/creators/me/analytics/earnings?period=30d')
        .expect(200);

      expect(creatorsService.getDashboardEarnings).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ period: '30d' }),
      );
      expect(response.body).toHaveProperty('totalGross', 12000000);
    });
  });
});
