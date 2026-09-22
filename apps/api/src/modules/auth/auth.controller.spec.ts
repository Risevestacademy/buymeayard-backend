import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, ForbiddenException } from '@nestjs/common';

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
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    changePassword: jest.Mock;
    verifyEmail: jest.Mock;
    sendVerificationEmail: jest.Mock;
    userHasRole: jest.Mock;
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

  const createSuccessResponse = (
    body: any,
    status = 200,
  ): globalThis.Response => {
    const webHeaders = new Headers();
    webHeaders.set(
      'set-cookie',
      'better-auth.session_token=token123; Path=/; HttpOnly',
    );
    webHeaders.set('content-type', 'application/json');
    return new Response(JSON.stringify(body), { status, headers: webHeaders });
  };

  beforeEach(async () => {
    authService = {
      signUpEmail: jest.fn(),
      signInEmail: jest.fn(),
      signOut: jest.fn(),
      getSessionFromNodeHeaders: jest.fn(),
      getAuth: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      changePassword: jest.fn(),
      verifyEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
      userHasRole: jest.fn(),
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

  // --------------------------------------------------------
  // REGISTER
  // --------------------------------------------------------

  describe('register', () => {
    it('should register user with SUPPORTER role on web', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse(
        { user: { id: 'u1', email: 'alice@example.com' } },
        201,
      );
      authService.signUpEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.register(dto, req, res);

      expect(authService.signUpEmail).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(result).toEqual({
        user: { id: 'u1', email: 'alice@example.com' },
      });
    });

    it('should reject registration on mobile', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const { req, res } = createMockReqRes({ 'x-client-type': 'mobile' });

      await expect(controller.register(dto, req, res)).rejects.toThrow(
        ForbiddenException,
      );
      expect(authService.signUpEmail).not.toHaveBeenCalled();
    });

    it('should forward set-cookie headers for web browser requests', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse(
        { user: { id: 'u1', email: 'alice@example.com' } },
        201,
      );
      authService.signUpEmail.mockResolvedValue(mockWebResponse);

      await controller.register(dto, req, res);

      expect(res.setHeader).toHaveBeenCalledWith('set-cookie', [
        'better-auth.session_token=token123; Path=/; HttpOnly',
      ]);
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

  // --------------------------------------------------------
  // LOGIN
  // --------------------------------------------------------

  describe('login', () => {
    it('should propagate session cookie for web frontend', async () => {
      const dto = { email: 'alice@example.com', password: 'Password123!' };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({
        user: { id: 'u1' },
        token: 'token456',
      });
      authService.signInEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.login(dto, req, res);

      expect(authService.signInEmail).toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith('set-cookie', [
        'better-auth.session_token=token123; Path=/; HttpOnly',
      ]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ user: { id: 'u1' }, token: 'token456' });
    });

    it('should allow mobile login for CREATOR users', async () => {
      const dto = { email: 'creator@example.com', password: 'Password123!' };
      const { req, res } = createMockReqRes({ 'x-client-type': 'mobile' });

      const mockWebResponse = createSuccessResponse({
        user: { id: 'u-creator' },
        token: 'token-creator',
      });
      authService.signInEmail.mockResolvedValue(mockWebResponse);
      authService.userHasRole.mockResolvedValue(true);

      const result = await controller.login(dto, req, res);

      expect(authService.userHasRole).toHaveBeenCalledWith(
        'u-creator',
        'CREATOR',
      );
      expect(result).toEqual({
        token: 'token-creator',
        user: { id: 'u-creator' },
      });
    });

    it('should reject mobile login for non-CREATOR users', async () => {
      const dto = { email: 'supporter@example.com', password: 'Password123!' };
      const { req, res } = createMockReqRes({ 'x-client-type': 'mobile' });

      const mockWebResponse = createSuccessResponse({
        user: { id: 'u-supporter' },
        token: 'token-supporter',
      });
      authService.signInEmail.mockResolvedValue(mockWebResponse);
      authService.userHasRole.mockResolvedValue(false);
      authService.signOut.mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      );

      await expect(controller.login(dto, req, res)).rejects.toThrow(
        ForbiddenException,
      );
      expect(authService.userHasRole).toHaveBeenCalledWith(
        'u-supporter',
        'CREATOR',
      );
    });

    it('should return token in JSON and omit cookies for mobile requests (x-platform: ios)', async () => {
      const dto = { email: 'creator@example.com', password: 'Password123!' };
      const { req, res } = createMockReqRes({ 'x-platform': 'ios' });

      const mockWebResponse = createSuccessResponse({
        user: { id: 'u1' },
        token: 'token456',
      });
      authService.signInEmail.mockResolvedValue(mockWebResponse);
      authService.userHasRole.mockResolvedValue(true);

      const result = await controller.login(dto, req, res);

      expect(res.removeHeader).toHaveBeenCalledWith('set-cookie');
      expect(res.setHeader).not.toHaveBeenCalledWith(
        'set-cookie',
        expect.anything(),
      );
      expect(result).toHaveProperty('token');
      expect(res.setHeader).toHaveBeenCalledWith(
        'authorization',
        expect.stringContaining('Bearer'),
      );
    });
  });

  // --------------------------------------------------------
  // LOGOUT
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // GET SESSION
  // --------------------------------------------------------

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

  // --------------------------------------------------------
  // FORGOT PASSWORD
  // --------------------------------------------------------

  describe('forgotPassword', () => {
    it('should call forgotPassword on auth service', async () => {
      const dto = { email: 'user@example.com' };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.forgotPassword.mockResolvedValue(mockWebResponse);

      const result = await controller.forgotPassword(dto, req, res);

      expect(authService.forgotPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        headers: expect.any(Headers),
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ status: true });
    });
  });

  // --------------------------------------------------------
  // RESET PASSWORD
  // --------------------------------------------------------

  describe('resetPassword', () => {
    it('should call resetPassword on auth service', async () => {
      const dto = { token: 'reset-token', newPassword: 'NewPassword123!' };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.resetPassword.mockResolvedValue(mockWebResponse);

      const result = await controller.resetPassword(dto, req, res);

      expect(authService.resetPassword).toHaveBeenCalledWith({
        token: 'reset-token',
        newPassword: 'NewPassword123!',
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ status: true });
    });
  });

  // --------------------------------------------------------
  // CHANGE PASSWORD
  // --------------------------------------------------------

  describe('changePassword', () => {
    it('should call changePassword on auth service with headers', async () => {
      const dto = {
        currentPassword: 'OldPassword!',
        newPassword: 'NewPassword123!',
      };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.changePassword.mockResolvedValue(mockWebResponse);

      const result = await controller.changePassword(dto, req, res);

      expect(authService.changePassword).toHaveBeenCalledWith({
        currentPassword: 'OldPassword!',
        newPassword: 'NewPassword123!',
        headers: expect.any(Headers),
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ status: true });
    });
  });

  // --------------------------------------------------------
  // VERIFY EMAIL
  // --------------------------------------------------------

  describe('verifyEmail', () => {
    it('should call verifyEmail on auth service', async () => {
      const dto = { token: 'verify-token-123' };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.verifyEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.verifyEmail(dto, req, res);

      expect(authService.verifyEmail).toHaveBeenCalledWith({
        token: 'verify-token-123',
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ status: true });
    });
  });

  // --------------------------------------------------------
  // SEND VERIFICATION EMAIL
  // --------------------------------------------------------

  describe('sendVerificationEmail', () => {
    it('should call sendVerificationEmail on auth service with user email', async () => {
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.sendVerificationEmail.mockResolvedValue(mockWebResponse);

      const result = await controller.sendVerificationEmail(
        req,
        res,
        'user@example.com',
      );

      expect(authService.sendVerificationEmail).toHaveBeenCalledWith({
        email: 'user@example.com',
        headers: expect.any(Headers),
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(result).toEqual({ status: true });
    });
  });
});
