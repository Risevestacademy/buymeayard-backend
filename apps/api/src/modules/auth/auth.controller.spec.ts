import { Test, TestingModule } from '@nestjs/testing';

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
    getSessionFromNodeHeaders: jest.Mock;
    getAuth: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      signUpEmail: jest.fn(),
      signInEmail: jest.fn(),
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
    it('should call signUpEmail with provided credentials', async () => {
      const dto = {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice',
      };
      const expected = { user: { id: 'u1' } };
      authService.signUpEmail.mockResolvedValue(expected);

      const result = await controller.register(dto);
      expect(result).toBe(expected);
      expect(authService.signUpEmail).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('should call signInEmail with provided credentials', async () => {
      const dto = { email: 'alice@example.com', password: 'Password123!' };
      const expected = { user: { id: 'u1' } };
      authService.signInEmail.mockResolvedValue(expected);

      const result = await controller.login(dto);
      expect(result).toBe(expected);
      expect(authService.signInEmail).toHaveBeenCalledWith(dto);
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
