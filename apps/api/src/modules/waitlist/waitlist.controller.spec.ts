import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

describe('WaitlistController', () => {
  let controller: WaitlistController;
  let service: {
    joinWaitlist: jest.Mock;
    getWaitlist: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      joinWaitlist: jest.fn(),
      getWaitlist: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaitlistController],
      providers: [
        {
          provide: WaitlistService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<WaitlistController>(WaitlistController);
  });

  it('should call waitlistService.joinWaitlist on POST', async () => {
    const expected = {
      message: 'Successfully joined the waitlist!',
      alreadyJoined: false,
      entry: { id: 'uuid-1', email: 'test@example.com' },
    };
    service.joinWaitlist.mockResolvedValue(expected);

    const result = await controller.joinWaitlist({ email: 'test@example.com' });
    expect(service.joinWaitlist).toHaveBeenCalledWith({
      email: 'test@example.com',
    });
    expect(result).toBe(expected);
  });

  it('should call waitlistService.getWaitlist on GET', async () => {
    const expected = {
      entries: [{ id: 'uuid-1', email: 'test@example.com' }],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    };
    service.getWaitlist.mockResolvedValue(expected);

    const result = await controller.getWaitlist({ page: 1, limit: 50 });
    expect(service.getWaitlist).toHaveBeenCalledWith({ page: 1, limit: 50 });
    expect(result).toBe(expected);
  });
});
