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
import { toNodeHandler } from 'better-auth/node';

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
    signInSocial: jest.Mock;
    userHasRole: jest.Mock;
    getIsOnboarded: jest.Mock;
    getUserAuthFlags: jest.Mock;
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
      signInSocial: jest.fn(),
      userHasRole: jest.fn(),
      getIsOnboarded: jest.fn().mockResolvedValue(false),
      getUserAuthFlags: jest.fn().mockResolvedValue({
        isOnboardingCompleted: false,
        isProfileSetupCompleted: false,
      }),
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
        user: {
          id: 'u1',
          email: 'alice@example.com',
          isOnboardingCompleted: false,
          isProfileSetupCompleted: false,
        },
        isOnboardingCompleted: false,
        isProfileSetupCompleted: false,
      });
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
      expect(result).toEqual({
        user: {
          id: 'u1',
          isOnboardingCompleted: false,
          isProfileSetupCompleted: false,
        },
        token: 'token456',
        isOnboardingCompleted: false,
        isProfileSetupCompleted: false,
      });
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

    it('should pass from param when explicitly provided in dto', async () => {
      const dto = { email: 'user@example.com', from: 'mobile' };
      const { req, res } = createMockReqRes();

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.forgotPassword.mockResolvedValue(mockWebResponse);

      await controller.forgotPassword(dto, req, res);

      expect(authService.forgotPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        from: 'mobile',
        headers: expect.any(Headers),
      });
    });

    it('should automatically set from to mobile if x-client-type is mobile', async () => {
      const dto = { email: 'user@example.com' };
      const { req, res } = createMockReqRes({ 'x-client-type': 'mobile' });

      const mockWebResponse = createSuccessResponse({ status: true });
      authService.forgotPassword.mockResolvedValue(mockWebResponse);

      await controller.forgotPassword(dto, req, res);

      expect(authService.forgotPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        from: 'mobile',
        headers: expect.any(Headers),
      });
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

  // --------------------------------------------------------
  // SOCIAL SIGN IN (REST & MOBILE)
  // --------------------------------------------------------

  describe('socialSignIn (POST /auth/social/sign-in)', () => {
    it('should call authService.signInSocial and return url and redirect flag', async () => {
      const { req } = createMockReqRes();
      authService.signInSocial.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
      });

      const result = await controller.socialSignIn(
        {
          provider: 'google',
          callbackURL: 'buymeayard://oauth-callback',
        },
        req,
      );

      expect(authService.signInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'buymeayard://oauth-callback',
        errorCallbackURL: 'buymeayard://oauth-callback',
        newUserCallbackURL: undefined,
        headers: expect.any(Headers),
      });
      expect(result).toEqual({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
      });
    });

    it('should default callbackURL to mobile custom scheme if x-client-type is mobile', async () => {
      const { req } = createMockReqRes({ 'x-client-type': 'mobile' });
      authService.signInSocial.mockResolvedValue({
        url: 'https://appleid.apple.com/auth/authorize?...',
        redirect: true,
      });

      const result = await controller.socialSignIn({ provider: 'apple' }, req);

      expect(authService.signInSocial).toHaveBeenCalledWith({
        provider: 'apple',
        callbackURL: 'buymeayard://oauth-callback',
        errorCallbackURL: 'buymeayard://oauth-callback',
        newUserCallbackURL: undefined,
        headers: expect.any(Headers),
      });
      expect(result.url).toContain('appleid.apple.com');
    });
  });

  describe('directSocialRedirect (GET /auth/social/:provider)', () => {
    it('should redirect browser to provider OAuth URL', async () => {
      const { req, res } = createMockReqRes();
      res.redirect = jest.fn();
      authService.signInSocial.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
      });

      await controller.directSocialRedirect(
        'google',
        'http://localhost:3000/dashboard',
        undefined,
        req,
        res,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
      );
    });

    it('should return JSON when redirect=false is passed', async () => {
      const { req, res } = createMockReqRes();
      res.json = jest.fn();
      authService.signInSocial.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
      });

      await controller.directSocialRedirect(
        'google',
        'buymeayard://oauth-callback',
        'false',
        req,
        res,
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
      });
    });

    it('should forward Set-Cookie headers from authService on redirect', async () => {
      const { req, res } = createMockReqRes();
      res.redirect = jest.fn();
      res.setHeader = jest.fn();
      const headers = new Headers();
      headers.set(
        'set-cookie',
        'better-auth.state=secret_state; Path=/; HttpOnly',
      );
      authService.signInSocial.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
        headers,
      });

      await controller.directSocialRedirect(
        'google',
        'http://localhost:3000/dashboard',
        undefined,
        req,
        res,
      );

      expect(res.setHeader).toHaveBeenCalledWith(
        'set-cookie',
        expect.arrayContaining([
          expect.stringContaining('better-auth.state=secret_state'),
        ]),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
      );
    });

    it('should pass errorCallbackURL query param to authService.signInSocial', async () => {
      const { req, res } = createMockReqRes();
      res.redirect = jest.fn();
      authService.signInSocial.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123',
        redirect: true,
      });

      await controller.directSocialRedirect(
        'google',
        'http://localhost:3000/dashboard',
        undefined,
        req,
        res,
        'http://localhost:3000/auth/error',
      );

      expect(authService.signInSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'http://localhost:3000/dashboard',
        errorCallbackURL: 'http://localhost:3000/auth/error',
        headers: expect.any(Headers),
      });
    });
  });

  describe('handleBetterAuth', () => {
    it('should append token to redirect Location when redirecting to mobile callback deep link', async () => {
      const mockHandler = jest.fn((req, res) => {
        res.setHeader('location', 'bmay-dev://oauth-callback');
        res.setHeader('set-cookie', [
          'better-auth.session_token=test-session-token-999; Path=/; HttpOnly',
        ]);
        res.writeHead(302);
      });
      (toNodeHandler as jest.Mock).mockReturnValue(mockHandler);

      const originalWriteHead = jest.fn();
      const headers: Record<string, any> = {};
      const res: any = {
        setHeader: jest.fn((k, v) => {
          headers[k.toLowerCase()] = v;
        }),
        getHeader: jest.fn((k) => headers[k.toLowerCase()]),
        writeHead: originalWriteHead,
      };
      const req: any = { headers: {} };

      await controller.handleBetterAuth(req, res);

      expect(headers['location']).toBe(
        'bmay-dev://oauth-callback?token=test-session-token-999',
      );
      expect(originalWriteHead).toHaveBeenCalledWith(302);
    });

    it('should not alter web redirects', async () => {
      const mockHandler = jest.fn((req, res) => {
        res.setHeader('location', 'http://localhost:3000/dashboard');
        res.setHeader('set-cookie', [
          'better-auth.session_token=test-session-token-999; Path=/; HttpOnly',
        ]);
        res.writeHead(302);
      });
      (toNodeHandler as jest.Mock).mockReturnValue(mockHandler);

      const headers: Record<string, any> = {};
      const res: any = {
        setHeader: jest.fn((k, v) => {
          headers[k.toLowerCase()] = v;
        }),
        getHeader: jest.fn((k) => headers[k.toLowerCase()]),
        writeHead: jest.fn(),
      };
      const req: any = { headers: {} };

      await controller.handleBetterAuth(req, res);

      expect(headers['location']).toBe('http://localhost:3000/dashboard');
    });

    it('should suppress set-cookie on mobile requests', async () => {
      const mockHandler = jest.fn((req, res) => {
        res.setHeader('set-cookie', ['cookie=123']);
        res.writeHead(200);
      });
      (toNodeHandler as jest.Mock).mockReturnValue(mockHandler);

      const capturedHeaders: string[] = [];
      const res: any = {
        setHeader: jest.fn((k) => {
          capturedHeaders.push(k.toLowerCase());
        }),
        getHeader: jest.fn(),
        writeHead: jest.fn(),
      };
      const req: any = { headers: { 'x-client-type': 'mobile' } };

      await controller.handleBetterAuth(req, res);

      expect(capturedHeaders).not.toContain('set-cookie');
    });
  });
});
