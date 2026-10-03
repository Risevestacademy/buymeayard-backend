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
});
