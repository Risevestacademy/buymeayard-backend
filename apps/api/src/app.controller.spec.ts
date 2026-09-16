jest.mock('@nestjs/terminus', () => ({
  HealthCheck: () => () => {},
  HealthCheckService: class {},
  PrismaHealthIndicator: class {},
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from './infrastructure/database/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let healthCheckService: jest.Mocked<HealthCheckService>;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      }),
    };

    const mockPrismaHealthIndicator = { pingCheck: jest.fn() };
    const mockPrismaService = {};

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: HealthCheckService, useValue: mockHealthCheckService },
        { provide: PrismaHealthIndicator, useValue: mockPrismaHealthIndicator },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    healthCheckService = app.get(HealthCheckService);
  });

  describe('check', () => {
    it('should return health status', async () => {
      const result = await appController.check();
      expect(result.status).toBe('ok');
      expect(healthCheckService.check).toHaveBeenCalled();
    });
  });
});
