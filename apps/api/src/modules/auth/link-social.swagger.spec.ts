jest.mock('better-auth/node', () => ({
  toNodeHandler: jest.fn(() => jest.fn()),
}));
jest.mock('./better-auth', () => ({ createBetterAuth: jest.fn() }));

import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('POST /auth/link-social', () => {
  let controller: AuthController;
  let app: Awaited<
    ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>
  >;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: {} }],
    }).compile();
    controller = app.get(AuthController);
  });

  it('is documented in Swagger', async () => {
    const nest = app.createNestApplication();
    nest.setGlobalPrefix('api/v1');
    await nest.init();
    const doc = SwaggerModule.createDocument(
      nest,
      new DocumentBuilder().build(),
    );
    const op = doc.paths['/api/v1/auth/link-social']?.post;
    expect(op).toBeDefined();
    expect(op?.summary).toContain('Connect a social account');
    expect(JSON.stringify(op?.requestBody)).toContain('LinkSocialDto');
    expect(Object.keys(op?.responses ?? {})).toEqual(
      expect.arrayContaining(['200', '400', '401']),
    );
    // The catch-all stays hidden.
    expect(Object.keys(doc.paths).some((p) => p.endsWith('/auth/*'))).toBe(
      false,
    );
    await nest.close();
  });

  it('forwards to the Better Auth handler', async () => {
    const spy = jest
      .spyOn(controller, 'handleBetterAuth')
      .mockResolvedValue(undefined);
    const req = {} as any;
    const res = {} as any;
    await controller.linkSocial(req, res);
    expect(spy).toHaveBeenCalledWith(req, res);
  });
});
