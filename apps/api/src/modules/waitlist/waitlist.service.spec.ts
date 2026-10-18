import { Test, TestingModule } from '@nestjs/testing';
import { WaitlistService } from './waitlist.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

describe('WaitlistService', () => {
  let service: WaitlistService;
  let prisma: {
    waitlistEntry: {
      findUnique: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      waitlistEntry: {
        findUnique: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaitlistService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<WaitlistService>(WaitlistService);
  });

  describe('joinWaitlist', () => {
    it('should create a new waitlist entry if not already present', async () => {
      prisma.waitlistEntry.findUnique.mockResolvedValue(null);
      const createdEntry = {
        id: 'entry-uuid-1',
        email: 'user@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.waitlistEntry.create.mockResolvedValue(createdEntry);

      const result = await service.joinWaitlist({ email: 'User@Example.com ' });

      expect(prisma.waitlistEntry.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
        data: { email: 'user@example.com' },
      });
      expect(result).toEqual({
        message: 'Successfully joined the waitlist!',
        alreadyJoined: false,
        entry: createdEntry,
      });
    });

    it('should gracefully handle already registered email idempotently', async () => {
      const existingEntry = {
        id: 'entry-uuid-1',
        email: 'existing@example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.waitlistEntry.findUnique.mockResolvedValue(existingEntry);

      const result = await service.joinWaitlist({
        email: 'Existing@Example.com',
      });

      expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        message: "You're already on the waitlist!",
        alreadyJoined: true,
        entry: existingEntry,
      });
    });
  });

  describe('getWaitlist', () => {
    it('should return paginated waitlist entries', async () => {
      const mockEntries = [
        { id: '1', email: 'first@example.com', createdAt: new Date() },
        { id: '2', email: 'second@example.com', createdAt: new Date() },
      ];
      prisma.waitlistEntry.count.mockResolvedValue(2);
      prisma.waitlistEntry.findMany.mockResolvedValue(mockEntries);

      const result = await service.getWaitlist({ page: 1, limit: 10 });

      expect(prisma.waitlistEntry.count).toHaveBeenCalledWith({ where: {} });
      expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 10,
      });
      expect(result).toEqual({
        entries: mockEntries,
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter entries when search term is provided', async () => {
      prisma.waitlistEntry.count.mockResolvedValue(1);
      prisma.waitlistEntry.findMany.mockResolvedValue([
        { id: '1', email: 'target@example.com', createdAt: new Date() },
      ]);

      await service.getWaitlist({ page: 1, limit: 10, search: 'target' });

      expect(prisma.waitlistEntry.count).toHaveBeenCalledWith({
        where: {
          email: {
            contains: 'target',
            mode: 'insensitive',
          },
        },
      });
    });
  });
});
