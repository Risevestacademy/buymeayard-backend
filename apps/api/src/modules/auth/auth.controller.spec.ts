import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';

jest.mock('better-auth/node', () => ({
  toNodeHandler: jest.fn(() => jest.fn()),
}));

jest.mock('./better-auth', () => ({
  createBetterAuth: jest.fn(),
}));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    signUpEmail: jest.Mock;
    signInEmail: jest.Mock;
    signOut: jest.Mock;
    getSessionFromNodeHeaders: jest.Mock;
    getAuth: jest.Mock;
  };

  const createMockReqRes = (headers: Record<string, string> = {}) => {
    const req = {
      headers: { host: 'localhost:4000', ...headers },
    } as any;
    const res = {
      setHeader: jest.fn(),
      removeHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as any;
    return { req, res };
  };

  beforeEach(async () => {
    authService = {
      signUpEmail: jest.fn(),
      signInEmail: jest.fn(),
      signOut: jest.fn(),
      getSessionFromNodeHeaders: jest.fn(),
      getAuth: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should forward set-cookie headers for web browser requests (no mobile header)', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const { req, res } = createMockReqRes();

      const webHeaders = new Headers();
      webHeaders.set(
        'set-cookie',
        'better-auth.session_token=token123; Path=/; HttpOnly',
      );
      webHeaders.set('content-type', 'application/json');

      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u1', email: 'alice@example.com' } }),
        { status: 201, headers: webHeaders },
      );
      authService.signUpEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.register(dto, req, res);

      expect(authService.signUpEmail).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('set-cookie', [
        'better-auth.session_token=token123; Path=/; HttpOnly',
      ]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toEqual({
        user: { id: 'u1', email: 'alice@example.com' },
      });
    });

    it('should suppress cookies and return token in JSON response for mobile requests (x-client-type: mobile)', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const { req, res } = createMockReqRes({ 'x-client-type': 'mobile' });

      const webHeaders = new Headers();
      webHeaders.set(
        'set-cookie',
        'better-auth.session_token=token123; Path=/; HttpOnly',
      );
      webHeaders.set('content-type', 'application/json');

      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u1', email: 'alice@example.com' } }),
        { status: 201, headers: webHeaders },
      );
      authService.signUpEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.register(dto, req, res);

      // Verify cookies are suppressed
      expect(res.removeHeader).toHaveBeenCalledWith('set-cookie');
      expect(res.setHeader).not.toHaveBeenCalledWith(
        'set-cookie',
        expect.anything(),
      );

      // Verify token is in JSON response
      expect(result).toEqual({
        token: 'token123',
        user: { id: 'u1', email: 'alice@example.com' },
      });

      // Verify Bearer authorization header is set
      expect(res.setHeader).toHaveBeenCalledWith(
        'authorization',
        'Bearer token123',
      );
    });

    it('should throw HttpException when better-auth returns an error response', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const { req, res } = createMockReqRes();

      const mockWebResponse = new Response(
        JSON.stringify({
          message: 'User already exists',
          code: 'USER_ALREADY_EXISTS',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
      authService.signUpEmail.mockResolvedValue(mockWebResponse);

      await expect(controller.register(dto, req, res)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('login', () => {
    it('should propagate session cookie for web frontend', async () => {
      const dto = { email: 'alice@example.com', password: 'Password123!' };
      const { req, res } = createMockReqRes();

      const webHeaders = new Headers();
      webHeaders.set(
        'set-cookie',
        'better-auth.session_token=token456; Path=/; HttpOnly',
      );
      webHeaders.set('content-type', 'application/json');

      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u1' }, token: 'token456' }),
        { status: 200, headers: webHeaders },
      );
      authService.signInEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.login(dto, req, res);

      expect(authService.signInEmail).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('set-cookie', [
        'better-auth.session_token=token456; Path=/; HttpOnly',
      ]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ user: { id: 'u1' }, token: 'token456' });
    });

    it('should return token in JSON and omit cookies for mobile requests (x-platform: ios)', async () => {
      const dto = { email: 'alice@example.com', password: 'Password123!' };
      const { req, res } = createMockReqRes({ 'x-platform': 'ios' });

      const webHeaders = new Headers();
      webHeaders.set(
        'set-cookie',
        'better-auth.session_token=token456; Path=/; HttpOnly',
      );
      webHeaders.set('content-type', 'application/json');

      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u1' }, token: 'token456' }),
        { status: 200, headers: webHeaders },
      );
      authService.signInEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.login(dto, req, res);

      expect(res.removeHeader).toHaveBeenCalledWith('set-cookie');
      expect(res.setHeader).not.toHaveBeenCalledWith(
        'set-cookie',
        expect.anything(),
      );
      expect(result).toEqual({ token: 'token456', user: { id: 'u1' } });
      expect(res.setHeader).toHaveBeenCalledWith(
        'authorization',
        'Bearer token456',
      );
    });
  });

  describe('logout', () => {
    it('should forward cookie clearance for web frontend', async () => {
      const { req, res } = createMockReqRes();

      const webHeaders = new Headers();
      webHeaders.set('set-cookie', 'better-auth.session_token=; Max-Age=0');
      webHeaders.set('content-type', 'application/json');

      const mockWebResponse = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: webHeaders,
      });
      authService.signOut.mockResolvedValue(mockWebResponse);

      const result = await controller.logout(req, res);

      expect(authService.signOut).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('set-cookie', [
        'better-auth.session_token=; Max-Age=0',
      ]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ success: true });
    });

    it('should omit cookies for mobile logout', async () => {
      const { req, res } = createMockReqRes({ 'x-client-type': 'mobile' });

      const webHeaders = new Headers();
      webHeaders.set('set-cookie', 'better-auth.session_token=; Max-Age=0');
      webHeaders.set('content-type', 'application/json');

      const mockWebResponse = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: webHeaders,
      });
      authService.signOut.mockResolvedValue(mockWebResponse);

      const result = await controller.logout(req, res);

      expect(res.removeHeader).toHaveBeenCalledWith('set-cookie');
      expect(res.setHeader).not.toHaveBeenCalledWith(
        'set-cookie',
        expect.anything(),
      );
      expect(result).toEqual({ token: null, success: true });
    });
  });

  describe('getSession', () => {
    it('should retrieve session from request headers', async () => {
      const req = { headers: { authorization: 'Bearer token-123' } } as any;
      const expected = { user: { id: 'u1' }, session: { id: 's1' } };
      authService.getSessionFromNodeHeaders.mockResolvedValue(expected);

      const result = await controller.getSession(req);
      expect(result).toBe(expected);
      expect(authService.getSessionFromNodeHeaders).toHaveBeenCalledWith(
        req.headers,
      );
    });
  });
});
