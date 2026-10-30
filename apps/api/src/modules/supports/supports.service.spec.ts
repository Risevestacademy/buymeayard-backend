import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SupportsService } from './supports.service';

describe('SupportsService guest gifting', () => {
  const adire = {
    id: 'cm-adire',
    creatorId: 'creator-1',
    price: 200_000, // ₦2,000 per yard
    currency: 'NGN',
    displayName: null,
    material: { name: 'Adire' },
  };
  const ankara = { ...adire, id: 'cm-ankara', material: { name: 'Ankara' } };

  function setup(
    creator: Record<string, unknown> | null = {},
    materials: { themed?: unknown; fallback?: unknown } = {
      themed: adire,
      fallback: ankara,
    },
  ) {
    const prisma = {
      creatorProfile: {
        findUnique: jest.fn().mockResolvedValue(
          creator && {
            id: 'creator-1',
            status: 'ACTIVE',
            isPublished: true,
            themeMaterialId: 'mat-adire',
            thankYouMessage: null,
            ...creator,
          },
        ),
      },
      creatorMaterial: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.materialId ? materials.themed : materials.fallback,
            ),
          ),
      },
      support: { create: jest.fn().mockResolvedValue({ id: 'support-1' }) },
    };
    const config = {
      get: jest.fn().mockResolvedValue({ platformFeePercent: 10 }),
    };
    return {
      prisma,
      service: new SupportsService(prisma as never, config as never),
    };
  }

  it('counts the gift in the creator theme fabric and returns the yard equivalent', async () => {
    const { service, prisma } = setup();

    const res = await service.createGuestIntent('adeola', {
      amount: 5000,
      name: ' Tomi ',
      email: 'Tomi@Example.com',
      message: 'Keep creating',
    });

    expect(res).toEqual({
      supportId: 'support-1',
      amount: 500_000,
      currency: 'NGN',
      yards: 2.5,
      materialName: 'Adire',
      thankYouMessage: 'Thank you so much for your support! It means a lot.',
    });
    expect(prisma.support.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guestName: 'Tomi',
          guestEmail: 'tomi@example.com',
          totalAmount: 500_000,
          platformFee: 50_000,
          creatorAmount: 450_000,
          status: 'CREATED',
        }),
      }),
    );
  });

  it('returns the creator thank-you message when they set one', async () => {
    const { service } = setup({ thankYouMessage: ' Thank you for the yard! ' });
    const res = await service.createGuestIntent('adeola', { amount: 1000 });
    expect(res.thankYouMessage).toBe('Thank you for the yard!');
  });

  it('falls back to the first active material when the theme fabric is not on the menu', async () => {
    const { service } = setup({}, { themed: null, fallback: ankara });
    const res = await service.quoteGift('adeola', { amount: 5000 });
    expect(res.materialName).toBe('Ankara');
  });

  it('refuses when the creator has no active material', async () => {
    const { service, prisma } = setup({}, { themed: null, fallback: null });
    await expect(
      service.createGuestIntent('adeola', { amount: 5000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.support.create).not.toHaveBeenCalled();
  });

  it('refuses gifts to a creator who is not ACTIVE', async () => {
    const { service, prisma } = setup({ status: 'KYC_PENDING' });
    await expect(
      service.createGuestIntent('adeola', { amount: 5000 }),
    ).rejects.toMatchObject({ response: { code: 'CREATOR_NOT_ACTIVE' } });
    expect(prisma.support.create).not.toHaveBeenCalled();
  });

  it.each([[null], [{ isPublished: false }]])(
    'treats a missing or unpublished creator as not found',
    async (creator) => {
      const { service } = setup(creator);
      await expect(
        service.quoteGift('adeola', { amount: 5000 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('rounds the yard equivalent to 2 decimals', async () => {
    const { service } = setup();
    const res = await service.quoteGift('adeola', { amount: 100 });
    expect(res.yards).toBe(0.05);
    const odd = await service.quoteGift('adeola', { amount: 333.33 });
    expect(odd.yards).toBe(0.17);
  });
});

describe('SupportsService.getPublicWall', () => {
  function setup(creator: Record<string, unknown> | null) {
    const prisma = {
      creatorProfile: { findUnique: jest.fn().mockResolvedValue(creator) },
      support: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's-1',
            createdAt: new Date('2026-10-06T10:00:00Z'),
            guestName: 'Tomi',
            message: 'Keep creating',
            isAnonymous: false,
            supporter: null,
            items: [
              {
                materialNameSnapshot: 'Adire',
                quantity: new Prisma.Decimal('2.5'),
                creatorMaterial: {
                  materialId: 'mat-adire',
                  material: {
                    color: '#7F3516',
                    thumbnailSmallUrl: 'https://cdn/adire-sm.png',
                    imageUrl: null,
                  },
                },
              },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValue(128),
      },
    };
    return {
      prisma,
      service: new SupportsService(prisma as never, {} as never),
    };
  }

  it('returns the gifts with the total supporter count', async () => {
    const { service } = setup({
      id: 'creator-1',
      isPublished: true,
      showSupportersOnPage: true,
    });
    const wall = await service.getPublicWall('adeola', {});
    expect(wall.supporterCount).toBe(128);
    expect(wall.items).toEqual([
      expect.objectContaining({
        id: 's-1',
        displayName: 'Tomi',
        materialId: 'mat-adire',
        materialName: 'Adire',
        material: {
          id: 'mat-adire',
          name: 'Adire',
          color: '#7F3516',
          thumbnailUrl: 'https://cdn/adire-sm.png',
          quantity: 2.5,
        },
      }),
    ]);
  });

  it('hides everything, including the count, when the creator turned the wall off', async () => {
    const { service, prisma } = setup({
      id: 'creator-1',
      isPublished: true,
      showSupportersOnPage: false,
    });
    await expect(service.getPublicWall('adeola', {})).resolves.toEqual({
      items: [],
      nextCursor: null,
      supporterCount: null,
    });
    expect(prisma.support.findMany).not.toHaveBeenCalled();
  });
});
