import { plainToInstance } from 'class-transformer';
import { Prisma } from '@prisma/client';
import { RequestPayoutDto } from '../../modules/payouts/dto/payout.dto';
import { MoneyUtil } from './money.util';

describe('MoneyUtil.toMajorDeep', () => {
  it('converts only the named keys, at any depth', () => {
    const date = new Date('2026-10-01');
    const yards = new Prisma.Decimal('2.5');
    const out = MoneyUtil.toMajorDeep(
      {
        amount: 500000,
        yards,
        createdAt: date,
        count: 3,
        items: [{ amount: 1050, label: 'x' }],
        nested: { amount: null, fee: 5000 },
      },
      ['amount', 'fee'],
    );
    expect(out).toEqual({
      amount: 5000,
      yards,
      createdAt: date,
      count: 3,
      items: [{ amount: 10.5, label: 'x' }],
      nested: { amount: null, fee: 50 },
    });
    expect(out.createdAt).toBe(date);
  });
});

describe('naira request fields', () => {
  it('turns a withdrawal amount in naira into kobo', () => {
    expect(plainToInstance(RequestPayoutDto, { amount: '45000' }).amount).toBe(
      4500000,
    );
    expect(plainToInstance(RequestPayoutDto, { amount: 1000.5 }).amount).toBe(
      100050,
    );
  });
});
