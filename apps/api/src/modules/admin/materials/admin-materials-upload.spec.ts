import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AdminMaterialsController } from './admin-materials.controller';
import { AdminMaterialsService } from './admin-materials.service';

describe('POST /admin/materials/thumbnail', () => {
  let app: INestApplication;
  const service = {
    uploadThumbnail: jest
      .fn()
      .mockResolvedValue({ url: 'https://cdn.test/materials/abc.jpg' }),
    get: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMaterialsController],
      providers: [{ provide: AdminMaterialsService, useValue: service }],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => service.uploadThumbnail.mockClear());

  const png = Buffer.from('89504e470d0a1a0a', 'hex');

  it('accepts an image and returns its url', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/materials/thumbnail')
      .attach('file', png, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: 'https://cdn.test/materials/abc.jpg' });
    expect(service.uploadThumbnail).toHaveBeenCalledTimes(1);
    expect(service.uploadThumbnail.mock.calls[0][0].buffer).toEqual(png);
  });

  it('rejects a non-image file', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/materials/thumbnail')
      .attach('file', Buffer.from('hello'), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(400);
    expect(service.uploadThumbnail).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/materials/thumbnail')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'big.png',
        contentType: 'image/png',
      });
    expect(res.status).toBe(400);
    expect(service.uploadThumbnail).not.toHaveBeenCalled();
  });

  it('rejects a request with no file', async () => {
    const res = await request(app.getHttpServer()).post(
      '/admin/materials/thumbnail',
    );
    expect(res.status).toBe(400);
    expect(service.uploadThumbnail).not.toHaveBeenCalled();
  });
});
