import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class MockEventEmitter2 {},
  EventEmitterModule: {
    forRoot: jest.fn(),
  },
}));
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PAYMENT_PROVIDER } from '../../infrastructure/payments/payment-provider.interface';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentStatus, SupportStatus, PayoutStatus } from '@buymeayard/types';
import { PAYMENT_EVENTS } from './events/payment-completed.event';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: any;
  let paymentProvider: any;
  let ledgerService: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prisma = {
      support: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      paymentEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      payout: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    paymentProvider = {
      providerName: 'PAYSTACK',
      initializePayment: jest.fn().mockResolvedValue({
        providerReference: 'pstk_ref_123',
        authorizationUrl: 'https://checkout.paystack.com/auth-123',
        accessCode: 'code_123',
      }),
      verifyWebhookSignature: jest.fn().mockResolvedValue({ isValid: true }),
    };

    ledgerService = {
      recordSupportPayment: jest.fn().mockResolvedValue(undefined),
      recordPayoutReversal: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
        { provide: LedgerService, useValue: ledgerService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('initializePayment', () => {
    it('should initialize payment successfully for a valid support order', async () => {
      prisma.support.findUnique.mockResolvedValue({
        id: 'sup_123',
        status: SupportStatus.CREATED,
        totalAmount: 15000,
        currency: 'NGN',
        supporter: { email: 'donor@example.com' },
      });

      prisma.payment.create.mockResolvedValue({
        id: 'pay_123',
        supportId: 'sup_123',
      });

      const result = await service.initializePayment('sup_123');

      expect(result.paymentId).toBe('pay_123');
      expect(result.providerReference).toBe('pstk_ref_123');
      expect(result.authorizationUrl).toBe(
        'https://checkout.paystack.com/auth-123',
      );
      expect(prisma.support.update).toHaveBeenCalledWith({
        where: { id: 'sup_123' },
        data: { status: SupportStatus.PAYMENT_PENDING },
      });
    });

    it('should throw BadRequestException if supporter email is missing', async () => {
      prisma.support.findUnique.mockResolvedValue({
        id: 'sup_123',
        status: SupportStatus.CREATED,
        totalAmount: 15000n,
        currency: 'NGN',
        supporter: null,
      });

      await expect(service.initializePayment('sup_123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when support order is not found', async () => {
      prisma.support.findUnique.mockResolvedValue(null);

      await expect(service.initializePayment('unknown_id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if support is already paid', async () => {
      prisma.support.findUnique.mockResolvedValue({
        id: 'sup_123',
        status: SupportStatus.PAID,
      });

      await expect(service.initializePayment('sup_123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleWebhook - charge.success', () => {
    it('should process charge.success, update records, credit ledger, and emit event', async () => {
      const payload = {
        event: 'charge.success',
        event_id: 'evt_100',
        data: {
          id: 9999,
          reference: 'pstk_ref_123',
          amount: 15000,
          currency: 'NGN',
        },
      };

      prisma.paymentEvent.findUnique.mockResolvedValue(null); // not duplicate
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay_123',
        supportId: 'sup_123',
        amount: 15000n,
        status: PaymentStatus.PROCESSING,
        currency: 'NGN',
        support: {
          id: 'sup_123',
          creatorId: 'creator_1',
          supporterId: 'supporter_1',
          totalAmount: 15000n,
          creatorAmount: 13500n,
          platformFee: 1500n,
          currency: 'NGN',
          message: 'Keep creating!',
          isAnonymous: false,
          supporter: { name: 'Ade', email: 'ade@example.com' },
          items: [
            {
              materialNameSnapshot: 'Ankara',
              quantity: 3,
              unitPrice: 5000n,
              totalPrice: 15000n,
            },
          ],
        },
      });

      const result = await service.handleWebhook(
        'valid_sig',
        payload,
        JSON.stringify(payload),
      );

      expect(result).toEqual({ received: true });
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_123' },
          data: expect.objectContaining({ status: PaymentStatus.SUCCESS }),
        }),
      );
      expect(prisma.support.update).toHaveBeenCalledWith({
        where: { id: 'sup_123' },
        data: { status: SupportStatus.PAID },
      });
      expect(ledgerService.recordSupportPayment).toHaveBeenCalledWith(
        'pay_123',
        'creator_1',
        13500n,
        1500n,
        'NGN',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        PAYMENT_EVENTS.COMPLETED,
        expect.objectContaining({
          paymentId: 'pay_123',
          supportId: 'sup_123',
          creatorId: 'creator_1',
          totalAmount: 15000n,
        }),
      );
    });

    it('should be idempotent and skip duplicate charge events', async () => {
      const payload = {
        event: 'charge.success',
        event_id: 'evt_duplicate',
      };
      prisma.paymentEvent.findUnique.mockResolvedValue({ id: 'existing_evt' });

      const result = await service.handleWebhook(
        'valid_sig',
        payload,
        JSON.stringify(payload),
      );

      expect(result.status).toBe('already_processed');
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject webhook with invalid signature', async () => {
      paymentProvider.verifyWebhookSignature.mockResolvedValue({
        isValid: false,
      });

      await expect(service.handleWebhook('bad_sig', {}, '{}')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('handleWebhook - transfer.success & transfer.failed', () => {
    it('should handle transfer.success by setting payout to SUCCESS', async () => {
      const payload = {
        event: 'transfer.success',
        data: { reference: 'payout_ref_1', id: 123 },
      };

      prisma.payout.findFirst.mockResolvedValue({
        id: 'payout_1',
        status: PayoutStatus.PROCESSING,
      });

      const result = await service.handleWebhook(
        'valid_sig',
        payload,
        JSON.stringify(payload),
      );

      expect(result.received).toBe(true);
      expect(prisma.payout.update).toHaveBeenCalledWith({
        where: { id: 'payout_1' },
        data: expect.objectContaining({ status: PayoutStatus.SUCCESS }),
      });
    });

    it('should handle transfer.failed by setting payout to FAILED and reversing ledger', async () => {
      const payload = {
        event: 'transfer.failed',
        data: {
          reference: 'payout_ref_1',
          reason: 'Invalid account number',
        },
      };

      prisma.payout.findFirst.mockResolvedValue({
        id: 'payout_1',
        accountId: 'acc_creator_1',
        amount: 50000,
        currency: 'NGN',
        status: PayoutStatus.PROCESSING,
      });

      const result = await service.handleWebhook(
        'valid_sig',
        payload,
        JSON.stringify(payload),
      );

      expect(result.received).toBe(true);
      expect(prisma.payout.update).toHaveBeenCalledWith({
        where: { id: 'payout_1' },
        data: expect.objectContaining({
          status: PayoutStatus.FAILED,
          failureReason: 'Invalid account number',
        }),
      });
      expect(ledgerService.recordPayoutReversal).toHaveBeenCalledWith(
        'payout_1',
        'acc_creator_1',
        50000,
        'NGN',
        'Invalid account number',
      );
    });
  });
});
