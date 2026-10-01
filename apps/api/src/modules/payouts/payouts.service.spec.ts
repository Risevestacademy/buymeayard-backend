import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import {
  PayoutStatus,
  LedgerEntryType,
  LedgerDirection,
} from '@buymeayard/types';

describe('PayoutsService', () => {
  let service: PayoutsService;
  let prisma: any;
  let ledgerService: any;
  let paymentProvider: any;

  beforeEach(async () => {
    prisma = {
      creatorProfile: {
        findUnique: jest.fn(),
      },
      payoutMethod: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      payout: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      ledgerEntry: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    ledgerService = {
      getOrCreateAccount: jest
        .fn()
        .mockResolvedValue({ id: 'acc_123', currency: 'NGN' }),
      getAccountBalance: jest.fn().mockResolvedValue(1000000), // NGN 10,000 available
      getDetailedBalance: jest.fn().mockResolvedValue({
        availableBalance: 1000000,
        pendingBalance: 200000,
        withdrawnBalance: 500000,
        currency: 'NGN',
      }),
      recordPayoutReversal: jest.fn().mockResolvedValue(undefined),
    };

    paymentProvider = {
      providerName: 'PAYSTACK',
      resolveAccountNumber: jest.fn().mockResolvedValue({
        accountNumber: '0123456789',
        accountName: 'John Doe',
        bankCode: '058',
      }),
      createTransferRecipient: jest.fn().mockResolvedValue({
        recipientCode: 'RCP_12345',
        name: 'John Doe',
        accountNumber: '0123456789',
        bankCode: '058',
      }),
      initiateTransfer: jest.fn().mockResolvedValue({
        success: true,
        transferCode: 'TRF_12345',
        reference: 'payout_123',
        status: 'pending',
        amount: 500000,
        currency: 'NGN',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LedgerService, useValue: ledgerService },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
      ],
    }).compile();

    service = module.get<PayoutsService>(PayoutsService);
  });

  describe('resolveAndAddPayoutMethod', () => {
    it('should resolve NUBAN, create Paystack recipient, and save payout method', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator_1',
        creatorName: 'Chef Amaka',
      });
      prisma.payoutMethod.count.mockResolvedValue(0);
      prisma.payoutMethod.create.mockResolvedValue({
        id: 'pm_1',
        bankName: 'Guaranty Trust Bank',
        accountName: 'John Doe',
        isDefault: true,
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const res = await service.resolveAndAddPayoutMethod('user_1', {
        accountNumber: '0123456789',
        bankCode: '058',
        bankName: 'Guaranty Trust Bank',
      });

      expect(paymentProvider.resolveAccountNumber).toHaveBeenCalledWith({
        accountNumber: '0123456789',
        bankCode: '058',
      });
      expect(paymentProvider.createTransferRecipient).toHaveBeenCalled();
      expect(prisma.payoutMethod.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          creatorId: 'creator_1',
          accountIdentifier: 'RCP_12345',
          accountName: 'John Doe',
          bankName: 'Guaranty Trust Bank',
          isDefault: true,
        }),
      });
      expect(res.maskedAccountNumber).toBe('******6789');
    });

    it('should throw NotFoundException if creator profile is not found', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveAndAddPayoutMethod('user_unknown', {
          accountNumber: '0123456789',
          bankCode: '058',
          bankName: 'GTB',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCreatorBalance', () => {
    it('should return real-time 3-tier balance breakdown from ledger service', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({ id: 'creator_1' });

      const balance = await service.getCreatorBalance('user_1');

      expect(balance).toEqual({
        availableBalance: 1000000,
        pendingBalance: 200000,
        withdrawnBalance: 500000,
        currency: 'NGN',
      });
      expect(ledgerService.getDetailedBalance).toHaveBeenCalledWith(
        'creator_1',
        'NGN',
      );
    });
  });

  describe('requestPayout', () => {
    it('should reject withdrawal when KYC status is not VERIFIED', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator_1',
        kycStatus: 'PENDING',
        payoutMethods: [{ id: 'pm_1', isDefault: true, status: 'ACTIVE' }],
      });

      await expect(service.requestPayout('user_1', 500000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject withdrawal when no active payout method exists', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator_1',
        kycStatus: 'VERIFIED',
        payoutMethods: [],
      });

      await expect(service.requestPayout('user_1', 500000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject withdrawal when amount exceeds available balance', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator_1',
        kycStatus: 'VERIFIED',
        payoutMethods: [{ id: 'pm_1', isDefault: true, status: 'ACTIVE' }],
      });
      ledgerService.getAccountBalance.mockResolvedValue(200000); // Only NGN 2,000 available

      await expect(service.requestPayout('user_1', 500000)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reserve funds in ledger and trigger Paystack transfer on success', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator_1',
        creatorName: 'Amaka',
        kycStatus: 'VERIFIED',
        payoutMethods: [
          {
            id: 'pm_1',
            accountIdentifier: 'RCP_12345',
            isDefault: true,
            status: 'ACTIVE',
          },
        ],
      });
      ledgerService.getAccountBalance.mockResolvedValue(1000000);
      prisma.payout.create.mockResolvedValue({
        id: 'payout_1',
        creatorId: 'creator_1',
        amount: 500000,
        currency: 'NGN',
        status: PayoutStatus.REQUESTED,
      });
      prisma.payout.update.mockResolvedValue({
        id: 'payout_1',
        status: PayoutStatus.PROCESSING,
        providerReference: 'TRF_12345',
      });

      const res = await service.requestPayout('user_1', 500000);

      expect(prisma.ledgerEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entryType: LedgerEntryType.PAYOUT_RESERVATION,
            direction: LedgerDirection.DEBIT,
            amount: 500000,
          }),
        }),
      );
      expect(paymentProvider.initiateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500000,
          recipientCode: 'RCP_12345',
        }),
      );
      expect(res.status).toBe(PayoutStatus.PROCESSING);
    });

    it('should reverse ledger reservation if Paystack transfer initiation fails', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({
        id: 'creator_1',
        kycStatus: 'VERIFIED',
        payoutMethods: [
          {
            id: 'pm_1',
            accountIdentifier: 'RCP_12345',
            isDefault: true,
            status: 'ACTIVE',
          },
        ],
      });
      ledgerService.getAccountBalance.mockResolvedValue(1000000);
      prisma.payout.create.mockResolvedValue({
        id: 'payout_1',
        creatorId: 'creator_1',
        amount: 500000,
        currency: 'NGN',
      });

      paymentProvider.initiateTransfer.mockRejectedValue(
        new Error('Paystack transfer service unavailable'),
      );

      await expect(service.requestPayout('user_1', 500000)).rejects.toThrow(
        BadRequestException,
      );

      expect(prisma.payout.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: PayoutStatus.FAILED,
            failureReason: 'Paystack transfer service unavailable',
          }),
        }),
      );
      expect(ledgerService.recordPayoutReversal).toHaveBeenCalledWith(
        'payout_1',
        'acc_123',
        500000,
        'NGN',
        'Paystack transfer service unavailable',
      );
    });
  });

  describe('getPayoutHistory', () => {
    it('should return creator past withdrawals ordered by requested date', async () => {
      prisma.creatorProfile.findUnique.mockResolvedValue({ id: 'creator_1' });
      prisma.payout.findMany.mockResolvedValue([
        {
          id: 'payout_1',
          amount: 500000,
          currency: 'NGN',
          status: 'SUCCESS',
          requestedAt: new Date(),
        },
      ]);

      const history = await service.getPayoutHistory('user_1');
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('payout_1');
    });
  });
});
