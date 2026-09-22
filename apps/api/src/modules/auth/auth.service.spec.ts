import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const mockBetterAuthInstance = {
  api: {
    getSession: jest.fn(),
    signUpEmail: jest.fn(),
    signInEmail: jest.fn(),
    signOut: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    changePassword: jest.fn(),
    verifyEmail: jest.fn(),
    sendVerificationEmail: jest.fn(),
  },
};

jest.mock('./better-auth', () => ({
  createBetterAuth: jest.fn(() => mockBetterAuthInstance),
}));

import { AuthService } from './auth.service';
import { createBetterAuth } from './better-auth';

describe('AuthService', () => {
  let service: AuthService;
  let configService: { get: jest.Mock };
  let prismaService: Record<string, any>;

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'BETTER_AUTH_SECRET') return 'test-secret';
        if (key === 'BETTER_AUTH_URL') return 'http://localhost:3000';
        return null;
      }),
    };

    prismaService = {
      role: {
        findUnique: jest.fn(),
      },
      userRole: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: configService },
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize betterAuth with config onModuleInit', () => {
    service.onModuleInit();
    expect(createBetterAuth).toHaveBeenCalledWith(prismaService, {
      secret: 'test-secret',
      baseURL: 'http://localhost:3000',
    });
  });

  describe('getSessionFromHeaders', () => {
    it('should query getSession with headers', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('authorization', 'Bearer token-xyz');
      const expectedSession = { user: { id: 'u1' }, session: { id: 's1' } };
      mockBetterAuthInstance.api.getSession.mockResolvedValue(expectedSession);

      const result = await service.getSessionFromHeaders(mockHeaders);
      expect(result).toEqual(expectedSession);
      expect(mockBetterAuthInstance.api.getSession).toHaveBeenCalledWith({
        headers: mockHeaders,
      });
    });
  });

  describe('getSessionFromNodeHeaders', () => {
    it('should convert node headers and query getSession', async () => {
      const nodeHeaders = { cookie: 'better-auth.session_token=test' };
      const expectedSession = { user: { id: 'u2' }, session: { id: 's2' } };
      mockBetterAuthInstance.api.getSession.mockResolvedValue(expectedSession);

      const result = await service.getSessionFromNodeHeaders(nodeHeaders);
      expect(result).toEqual(expectedSession);
      expect(mockBetterAuthInstance.api.getSession).toHaveBeenCalled();
    });
  });

  describe('signUpEmail', () => {
    it('should call signUpEmail on betterAuth api with asResponse: true', async () => {
      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u3' } }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      );
      mockBetterAuthInstance.api.signUpEmail.mockResolvedValue(mockWebResponse);

      const result = await service.signUpEmail({
        email: 'test@example.com',
        password: 'Password123!',
        name: 'Test User',
      });

      expect(result).toEqual(mockWebResponse);
      expect(mockBetterAuthInstance.api.signUpEmail).toHaveBeenCalledWith({
        body: {
          email: 'test@example.com',
          password: 'Password123!',
          name: 'Test User',
        },
        asResponse: true,
      });
    });
  });

  describe('signUpEmail', () => {
    it('should call signUpEmail on betterAuth api with asResponse: true', async () => {
      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u-new' } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
      mockBetterAuthInstance.api.signUpEmail.mockResolvedValue(mockWebResponse);

      const result = await service.signUpEmail({
        email: 'new@example.com',
        password: 'Password123!',
        name: 'New User',
      });

      expect(mockBetterAuthInstance.api.signUpEmail).toHaveBeenCalledWith({
        body: {
          email: 'new@example.com',
          password: 'Password123!',
          name: 'New User',
        },
        asResponse: true,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('signInEmail', () => {
    it('should call signInEmail on betterAuth api with asResponse: true', async () => {
      const mockWebResponse = new Response(
        JSON.stringify({ user: { id: 'u4' } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
      mockBetterAuthInstance.api.signInEmail.mockResolvedValue(mockWebResponse);

      const result = await service.signInEmail({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result).toEqual(mockWebResponse);
      expect(mockBetterAuthInstance.api.signInEmail).toHaveBeenCalledWith({
        body: {
          email: 'test@example.com',
          password: 'Password123!',
        },
        asResponse: true,
      });
    });
  });

  describe('signOut', () => {
    it('should call signOut on betterAuth api with asResponse: true', async () => {
      const mockWebResponse = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      mockBetterAuthInstance.api.signOut.mockResolvedValue(mockWebResponse);

      const result = await service.signOut();

      expect(result).toEqual(mockWebResponse);
      expect(mockBetterAuthInstance.api.signOut).toHaveBeenCalledWith({
        headers: expect.any(Headers),
        asResponse: true,
      });
    });
  });

  describe('forgotPassword', () => {
    it('should call forgetPassword on betterAuth api', async () => {
      const mockWebResponse = new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      mockBetterAuthInstance.api.requestPasswordReset.mockResolvedValue(
        mockWebResponse,
      );

      const result = await service.forgotPassword({
        email: 'user@example.com',
      });

      expect(result).toEqual(mockWebResponse);
      expect(
        mockBetterAuthInstance.api.requestPasswordReset,
      ).toHaveBeenCalledWith({
        body: {
          email: 'user@example.com',
          redirectTo: '/reset-password',
        },
        asResponse: true,
      });
    });
  });

  describe('resetPassword', () => {
    it('should call resetPassword on betterAuth api', async () => {
      const mockWebResponse = new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      mockBetterAuthInstance.api.resetPassword.mockResolvedValue(
        mockWebResponse,
      );

      const result = await service.resetPassword({
        token: 'reset-token-123',
        newPassword: 'NewPassword123!',
      });

      expect(result).toEqual(mockWebResponse);
      expect(mockBetterAuthInstance.api.resetPassword).toHaveBeenCalledWith({
        body: {
          token: 'reset-token-123',
          newPassword: 'NewPassword123!',
        },
        asResponse: true,
      });
    });
  });

  describe('changePassword', () => {
    it('should call changePassword on betterAuth api with headers', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('authorization', 'Bearer token-123');
      const mockWebResponse = new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      mockBetterAuthInstance.api.changePassword.mockResolvedValue(
        mockWebResponse,
      );

      const result = await service.changePassword({
        currentPassword: 'OldPassword!',
        newPassword: 'NewPassword123!',
        headers: mockHeaders,
      });

      expect(result).toEqual(mockWebResponse);
      expect(mockBetterAuthInstance.api.changePassword).toHaveBeenCalledWith({
        body: {
          currentPassword: 'OldPassword!',
          newPassword: 'NewPassword123!',
        },
        headers: mockHeaders,
        asResponse: true,
      });
    });
  });

  describe('verifyEmail', () => {
    it('should call verifyEmail on betterAuth api', async () => {
      const mockWebResponse = new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      mockBetterAuthInstance.api.verifyEmail.mockResolvedValue(mockWebResponse);

      const result = await service.verifyEmail({
        token: 'verify-token-123',
      });

      expect(result).toEqual(mockWebResponse);
      expect(mockBetterAuthInstance.api.verifyEmail).toHaveBeenCalledWith({
        query: {
          token: 'verify-token-123',
        },
        asResponse: true,
      });
    });
  });

  describe('sendVerificationEmail', () => {
    it('should call sendVerificationEmail on betterAuth api with headers', async () => {
      const mockHeaders = new Headers();
      mockHeaders.set('authorization', 'Bearer token-123');
      const mockWebResponse = new Response(JSON.stringify({ status: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      mockBetterAuthInstance.api.sendVerificationEmail.mockResolvedValue(
        mockWebResponse,
      );

      const result = await service.sendVerificationEmail({
        email: 'user@example.com',
        headers: mockHeaders,
      });

      expect(result).toEqual(mockWebResponse);
      expect(
        mockBetterAuthInstance.api.sendVerificationEmail,
      ).toHaveBeenCalledWith({
        body: {
          email: 'user@example.com',
        },
        headers: mockHeaders,
        asResponse: true,
      });
    });
  });

  describe('userHasRole', () => {
    it('should return true when user has the role', async () => {
      prismaService.userRole.findFirst.mockResolvedValue({
        userId: 'u1',
        roleId: 'r1',
      });

      const result = await service.userHasRole('u1', 'CREATOR');
      expect(result).toBe(true);
      expect(prismaService.userRole.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          role: { name: 'CREATOR' },
        },
      });
    });

    it('should return false when user does not have the role', async () => {
      prismaService.userRole.findFirst.mockResolvedValue(null);

      const result = await service.userHasRole('u1', 'CREATOR');
      expect(result).toBe(false);
    });
  });
});
