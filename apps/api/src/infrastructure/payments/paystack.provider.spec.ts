import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaystackProvider } from './paystack.provider';

describe('PaystackProvider', () => {
  let provider: PaystackProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mock';
              if (key === 'PAYSTACK_WEBHOOK_SECRET')
                return 'test_webhook_secret';
              return null;
            }),
          },
        },
      ],
    }).compile();

    provider = module.get<PaystackProvider>(PaystackProvider);
  });

  describe('Mock Mode (sk_test_mock)', () => {
    it('should initialize payment with mock values', async () => {
      const res = await provider.initializePayment({
        paymentId: 'pay_12345678',
        supportId: 'sup_123',
        amount: 500000,
        currency: 'NGN',
        email: 'test@example.com',
      });

      expect(res.providerReference).toContain('pstk_ref_');
      expect(res.authorizationUrl).toContain('mock-auth-pay_12345678');
      expect(res.accessCode).toBeDefined();
    });

    it('should verify payment in mock mode', async () => {
      const res = await provider.verifyPayment('mock_ref_123');
      expect(res.success).toBe(true);
      expect(res.status).toBe('SUCCESS');
      expect(res.providerReference).toBe('mock_ref_123');
    });

    it('should resolve account number in mock mode', async () => {
      const res = await provider.resolveAccountNumber({
        accountNumber: '0123456789',
        bankCode: '058',
      });
      expect(res.accountNumber).toBe('0123456789');
      expect(res.accountName).toBe('DEMO CREATOR ACCOUNT');
      expect(res.bankCode).toBe('058');
    });

    it('should create transfer recipient in mock mode', async () => {
      const res = await provider.createTransferRecipient({
        name: 'Demo Creator',
        accountNumber: '0123456789',
        bankCode: '058',
      });
      expect(res.recipientCode).toContain('RCP_mock_');
      expect(res.name).toBe('Demo Creator');
      expect(res.accountNumber).toBe('0123456789');
    });

    it('should initiate transfer in mock mode', async () => {
      const res = await provider.initiateTransfer({
        amount: 100000,
        recipientCode: 'RCP_mock_123',
        reference: 'payout_ref_123',
      });
      expect(res.success).toBe(true);
      expect(res.transferCode).toContain('TRF_mock_');
      expect(res.reference).toBe('payout_ref_123');
    });
  });

  describe('Webhook Verification', () => {
    it('should correctly verify valid sha512 signature', async () => {
      const payload = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_123' },
      });
      const secret = 'test_webhook_secret';
      const validSignature = crypto
        .createHmac('sha512', secret)
        .update(payload)
        .digest('hex');

      const result = await provider.verifyWebhookSignature(
        validSignature,
        payload,
      );
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const payload = JSON.stringify({ event: 'charge.success' });
      const result = await provider.verifyWebhookSignature(
        'invalid_signature',
        payload,
      );
      expect(result.isValid).toBe(false);
    });

    it('should reject empty signature', async () => {
      const result = await provider.verifyWebhookSignature('', 'body');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Live Mode API Requests', () => {
    let liveProvider: PaystackProvider;
    let globalFetchSpy: jest.SpyInstance;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaystackProvider,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'PAYSTACK_SECRET_KEY')
                  return 'test_live_key_for_testing_only';
                if (key === 'PAYSTACK_WEBHOOK_SECRET') return 'wh_sec';
                return null;
              }),
            },
          },
        ],
      }).compile();

      liveProvider = module.get<PaystackProvider>(PaystackProvider);
    });

    afterEach(() => {
      if (globalFetchSpy) {
        globalFetchSpy.mockRestore();
      }
    });

    it('should call Paystack API to resolve account when live key is set', async () => {
      globalFetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          message: 'Account details resolved',
          data: {
            account_number: '0123456789',
            account_name: 'Jane Doe',
            bank_id: 9,
          },
        }),
      } as any);

      const res = await liveProvider.resolveAccountNumber({
        accountNumber: '0123456789',
        bankCode: '058',
      });

      expect(globalFetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '/bank/resolve?account_number=0123456789&bank_code=058',
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test_live_key_for_testing_only',
          }),
        }),
      );
      expect(res.accountName).toBe('Jane Doe');
    });

    it('should throw BadRequestException when Paystack API returns error', async () => {
      globalFetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          status: false,
          message: 'Could not resolve account name. Check parameters',
        }),
      } as any);

      await expect(
        liveProvider.resolveAccountNumber({
          accountNumber: '0000000000',
          bankCode: '999',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
