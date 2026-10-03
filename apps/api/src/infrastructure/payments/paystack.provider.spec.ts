import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PaystackProvider } from './paystack.provider';
import * as crypto from 'crypto';

describe('PaystackProvider', () => {
  let provider: PaystackProvider;
  let configService: Partial<ConfigService>;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('when configured with real secret key', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'PAYSTACK_SECRET_KEY')
            return 'sk_test_validsecretkey12345';
          if (key === 'PAYSTACK_WEBHOOK_SECRET')
            return 'whsec_validwebhookkey12345';
          return null;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaystackProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      provider = module.get<PaystackProvider>(PaystackProvider);
    });

    it('should initialize payment calling Paystack API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: true,
          data: {
            authorization_url: 'https://checkout.paystack.com/real-auth-url',
            access_code: 'real_access_code',
            reference: 'pay_123456',
          },
        }),
      } as any);

      const result = await provider.initializePayment({
        paymentId: 'pay_123456',
        supportId: 'supp_1',
        amount: 500000,
        currency: 'NGN',
        email: 'supporter@example.com',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.paystack.co/transaction/initialize',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_validsecretkey12345',
          }),
        }),
      );
      expect(result.authorizationUrl).toBe(
        'https://checkout.paystack.com/real-auth-url',
      );
      expect(result.accessCode).toBe('real_access_code');
    });

    it('should verify payment calling Paystack API', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: true,
          data: {
            id: 998877,
            status: 'success',
            reference: 'pay_123456',
            amount: 500000,
            currency: 'NGN',
            paid_at: '2026-10-01T12:00:00Z',
          },
        }),
      } as any);

      const result = await provider.verifyPayment('pay_123456');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.paystack.co/transaction/verify/pay_123456',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer sk_test_validsecretkey12345',
          }),
        }),
      );
      expect(result.success).toBe(true);
      expect(result.amount).toBe(500000);
      expect(result.providerTransactionId).toBe('998877');
    });

    it('should verify webhook signature correctly', async () => {
      const payload = JSON.stringify({
        event: 'charge.success',
        data: { id: 1 },
      });
      const signature = crypto
        .createHmac('sha512', 'whsec_validwebhookkey12345')
        .update(payload)
        .digest('hex');

      const result = await provider.verifyWebhookSignature(signature, payload);
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid webhook signature', async () => {
      const payload = JSON.stringify({ event: 'charge.success' });
      const result = await provider.verifyWebhookSignature(
        'invalid_signature',
        payload,
      );
      expect(result.isValid).toBe(false);
    });
  });

  describe('when unconfigured or using mock key', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn((key: string) => {
          if (key === 'PAYSTACK_SECRET_KEY') return 'sk_test_mock';
          return null;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PaystackProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      provider = module.get<PaystackProvider>(PaystackProvider);
    });

    it('should return mock fallback when mock key is provided', async () => {
      const result = await provider.initializePayment({
        paymentId: 'mock_pay_1',
        supportId: 'supp_1',
        amount: 1000,
        currency: 'NGN',
        email: 'test@example.com',
      });

      expect(result.authorizationUrl).toContain('mock-auth');
    });
  });
});
