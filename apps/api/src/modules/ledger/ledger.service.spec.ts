import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import {
  AccountType,
  LedgerDirection,
  LedgerEntryType,
} from '@buymeayard/types';

describe('LedgerService', () => {
  let service: LedgerService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      account: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      ledgerEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      payout: {
        aggregate: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LedgerService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
  });

  describe('getOrCreateAccount', () => {
    it('should return existing account if found', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc_123',
        ownerType: AccountType.CREATOR,
        ownerId: 'creator_1',
        currency: 'NGN',
      });

      const account = await service.getOrCreateAccount(
        AccountType.CREATOR,
        'creator_1',
      );
      expect(account.id).toBe('acc_123');
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('should create new account if none exists', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue({
        id: 'acc_new',
        ownerType: AccountType.CREATOR,
        ownerId: 'creator_1',
        currency: 'NGN',
      });

      const account = await service.getOrCreateAccount(
        AccountType.CREATOR,
        'creator_1',
      );
      expect(account.id).toBe('acc_new');
      expect(prisma.account.create).toHaveBeenCalledWith({
        data: {
          ownerType: AccountType.CREATOR,
          ownerId: 'creator_1',
          currency: 'NGN',
          status: 'ACTIVE',
        },
      });
    });
  });

  describe('recordSupportPayment', () => {
    it('should credit creator account and platform fee account in a transaction', async () => {
      prisma.account.findFirst
        .mockResolvedValueOnce({ id: 'acc_creator' })
        .mockResolvedValueOnce({ id: 'acc_platform' });

      await service.recordSupportPayment(
        'tx_1',
        'creator_1',
        13500,
        1500,
        'NGN',
      );

      expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(2);
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc_creator',
          entryType: LedgerEntryType.SUPPORT_PAYMENT,
          direction: LedgerDirection.CREDIT,
          amount: 13500n,
        }),
      });
      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc_platform',
          entryType: LedgerEntryType.PLATFORM_FEE,
          direction: LedgerDirection.CREDIT,
          amount: 1500n,
        }),
      });
    });
  });

  describe('getAccountBalance', () => {
    it('should calculate balance by summing credits and subtracting debits', async () => {
      prisma.ledgerEntry.findMany.mockResolvedValue([
        { direction: LedgerDirection.CREDIT, amount: 20000n },
        { direction: LedgerDirection.DEBIT, amount: 5000n },
        { direction: LedgerDirection.CREDIT, amount: 10000n },
      ]);

      const balance = await service.getAccountBalance('acc_123');
      expect(balance).toBe(25000); // 20000 - 5000 + 10000
    });
  });

  describe('recordPayoutReversal', () => {
    it('should create credit ledger entry to restore creator balance', async () => {
      await service.recordPayoutReversal(
        'payout_1',
        'acc_123',
        50000,
        'NGN',
        'Bank rejected',
      );

      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'acc_123',
          transactionId: 'payout_1',
          entryType: LedgerEntryType.PAYOUT_REVERSED,
          direction: LedgerDirection.CREDIT,
          amount: 50000n,
          metadata: { reason: 'Bank rejected' },
        }),
      });
    });
  });

  describe('getDetailedBalance', () => {
    it('should aggregate available, pending, and withdrawn balance for creator', async () => {
      prisma.account.findFirst.mockResolvedValue({
        id: 'acc_123',
        currency: 'NGN',
      });
      prisma.ledgerEntry.findMany.mockResolvedValue([
        { direction: LedgerDirection.CREDIT, amount: 100000 },
        { direction: LedgerDirection.DEBIT, amount: 30000 },
      ]);
      prisma.payout.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 30000 } }) // pending
        .mockResolvedValueOnce({ _sum: { amount: 50000 } }); // completed

      const detailed = await service.getDetailedBalance('creator_1', 'NGN');

      expect(detailed).toEqual({
        availableBalance: 70000, // 100000 - 30000
        pendingBalance: 30000,
        withdrawnBalance: 50000,
        currency: 'NGN',
      });
    });
  });
});
