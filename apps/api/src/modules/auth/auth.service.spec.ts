import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const mockBetterAuthInstance = {
  api: {
    getSession: jest.fn(),
    signUpEmail: jest.fn(),
    signInEmail: jest.fn(),
    signOut: jest.fn(),
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
        if (key === 'BETTER_AUTH_URL') return 'http://localhost:4000';
        return null;
      }),
    };

    prismaService = {};

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
      baseURL: 'http://localhost:4000',
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
});
