import { Prisma } from '@prisma/client';
import { AdminSupportsService } from './admin-supports.service';

describe('AdminSupportsService contribution material', () => {
  const support = {
    id: 's-1',
    totalAmount: 500_000,
    items: [
      {
        id: 'i-1',
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
  };

  function setup() {
    const prisma = {
      support: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([support]),
        findUnique: jest.fn().mockResolvedValue({
          ...support,
          payment: null,
          tickets: [],
        }),
      },
      ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return new AdminSupportsService(prisma as never, {} as never, {} as never);
  }

  const expected = {
    id: 'mat-adire',
    name: 'Adire',
    color: '#7F3516',
    thumbnailUrl: 'https://cdn/adire-sm.png',
    quantity: 2.5,
  };

  it('adds the material to each listed contribution without leaking catalogue rows', async () => {
    const res = await setup().list({ page: 1, limit: 20 });
    expect(res.items[0].material).toEqual(expected);
    expect(res.items[0].items[0]).not.toHaveProperty('creatorMaterial');
  });

  it('adds the material to a single contribution', async () => {
    const res = await setup().get('s-1');
    expect(res.material).toEqual(expected);
    expect(res.items[0]).not.toHaveProperty('creatorMaterial');
  });
});
