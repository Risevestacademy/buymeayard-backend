import { NotFoundException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';

describe('SupportTicketsService', () => {
  function setup(opts: { payout?: unknown; support?: unknown } = {}) {
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Ayo Loco',
          email: 'ayo@example.com',
        }),
      },
      payout: {
        findFirst: jest.fn().mockResolvedValue(
          'payout' in opts
            ? opts.payout
            : {
                id: 'payout-1',
                reference: 'PYT-20250105-0033',
                amount: 1_250_000,
                netAmount: 1_245_000,
                status: 'FAILED',
                requestedAt: new Date('2025-01-05T10:12:00Z'),
                bankName: 'GTBank',
                accountNumberLast4: '4589',
              },
        ),
      },
      support: { findFirst: jest.fn().mockResolvedValue(opts.support ?? null) },
      supportTicket: {
        create: jest.fn().mockImplementation((args) =>
          Promise.resolve({
            id: 'ticket-12345678',
            status: 'OPEN',
            createdAt: new Date(),
            ...args.data,
          }),
        ),
      },
    };
    const dispatcher = { sendEmail: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('help@buymeayard.com') };
    return {
      prisma,
      dispatcher,
      service: new SupportTicketsService(
        prisma as never,
        dispatcher as never,
        config as never,
      ),
    };
  }

  it('stores the message with the payout details and emails support', async () => {
    const { service, prisma, dispatcher } = setup();

    const ticket = await service.create('user-1', {
      message: 'My <b>withdrawal</b> failed',
      payoutId: 'payout-1',
    });

    expect(ticket).toMatchObject({ id: 'ticket-12345678', status: 'OPEN' });
    expect(prisma.payout.findFirst).toHaveBeenCalledWith({
      where: { id: 'payout-1', creator: { userId: 'user-1' } },
    });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        payoutId: 'payout-1',
        context: {
          payout: expect.objectContaining({
            reference: 'PYT-20250105-0033',
            status: 'FAILED',
          }),
        },
      }),
    });
    const [to, , html] = dispatcher.sendEmail.mock.calls[0];
    expect(to).toBe('help@buymeayard.com');
    expect(html).toContain('PYT-20250105-0033');
    expect(html).toContain('&lt;b&gt;withdrawal&lt;/b&gt;'); // user text escaped
  });

  it('refuses a payout that belongs to someone else', async () => {
    const { service, prisma } = setup({ payout: null });
    await expect(
      service.create('user-1', { message: 'help', payoutId: 'payout-x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supportTicket.create).not.toHaveBeenCalled();
  });

  it('attaches a contribution the user received', async () => {
    const { service, prisma } = setup({
      support: {
        id: 'sup-1',
        creatorAmount: 550_000,
        status: 'PAID',
        createdAt: new Date('2025-01-06T11:42:00Z'),
      },
    });

    await service.create('user-1', {
      message: 'Wrong amount',
      contributionId: 'sup-1',
    });

    expect(prisma.support.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'sup-1',
        creator: { userId: 'user-1' },
      },
    });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ supportId: 'sup-1' }),
    });
  });
});
