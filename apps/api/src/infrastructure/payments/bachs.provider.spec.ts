import * as crypto from 'crypto';
import {
  BachsProvider,
  decodeRecipient,
  encodeRecipient,
  fromDecimal,
  toDecimal,
} from './bachs.provider';
import { PaymentProviderRejectedError } from './payment-provider.interface';

const SECRET = 'whsec_test';

function make(config: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    BACHS_API_KEY: 'sk_sandbox_real',
    BACHS_WEBHOOK_SECRET: SECRET,
    ...config,
  };
  return new BachsProvider({ get: (k: string) => values[k] } as never);
}

function sign(body: string, ts = Math.floor(Date.now() / 1000)) {
  const v1 = crypto
    .createHmac('sha256', SECRET)
    .update(`${ts}.${body}`)
    .digest('hex');
  return `t=${ts},v1=${v1}`;
}

describe('BachsProvider', () => {
  const fetchMock = jest.fn();
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });

  beforeEach(() => {
    fetchMock.mockReset();
    (global as any).fetch = fetchMock;
  });

  describe('money and recipient codes', () => {
    it('converts between kobo and decimal strings', () => {
      expect(toDecimal(500_000)).toBe('5000.00');
      expect(toDecimal(5_050)).toBe('50.50');
      expect(fromDecimal('7000.00')).toBe(700_000);
      expect(fromDecimal(undefined)).toBe(0);
    });

    it('round-trips and rejects malformed recipient codes', () => {
      const code = encodeRecipient({
        accountId: 'acct_1',
        destinationId: 'pd_1',
      });
      expect(code).toBe('acct_1:pd_1');
      expect(decodeRecipient(code)).toEqual({
        accountId: 'acct_1',
        destinationId: 'pd_1',
      });
      expect(decodeRecipient('RCP_123')).toBeNull();
      expect(decodeRecipient(null)).toBeNull();
      expect(decodeRecipient('acct_1:pd_1:x')).toBeNull();
    });
  });

  describe('configuration', () => {
    it('charges a 50 naira payout fee by default and reads an override', () => {
      expect(make().payoutFee).toBe(5_000);
      expect(make({ BACHS_PAYOUT_FEE: 75 }).payoutFee).toBe(7_500);
    });

    it('picks the base URL from the key unless one is set', async () => {
      reply(200, { banks: [] });
      await make({ BACHS_API_KEY: 'sk_live_real' }).listBanks();
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.bachs.io/v1/reference/banks?country=NG',
      );

      reply(200, { banks: [] });
      await make().listBanks();
      expect(fetchMock.mock.calls[1][0]).toContain('sandbox-api.bachs.io');

      reply(200, { banks: [] });
      await make({ BACHS_BASE_URL: 'http://localhost:1' }).listBanks();
      expect(fetchMock.mock.calls[2][0]).toContain('http://localhost:1');
    });

    it('works offline with a mock key', async () => {
      const mock = make({ BACHS_API_KEY: 'sk_sandbox_mock' });
      expect((await mock.listBanks()).length).toBeGreaterThan(0);
      const init = await mock.initializePayment({
        paymentId: 'abcdef123456',
        supportId: 's',
        amount: 100,
        currency: 'NGN',
        email: 'a@b.c',
        callbackUrl: 'https://x',
      });
      expect(init.providerReference).toMatch(/^chk_mock_/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('initializePayment', () => {
    it('creates a checkout with the amount as a decimal string', async () => {
      reply(201, { checkout_id: 'chk_1', checkout_url: 'https://pay/chk_1' });

      const res = await make().initializePayment({
        paymentId: 'pay-1',
        supportId: 'sup-1',
        amount: 500_000,
        currency: 'NGN',
        email: 'fan@example.com',
        callbackUrl: 'https://app/thanks',
        metadata: { k: 'v' },
      });

      expect(res).toEqual({
        providerReference: 'chk_1',
        authorizationUrl: 'https://pay/chk_1',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/v1/checkout-sessions');
      expect(init.headers.Authorization).toBe('Bearer sk_sandbox_real');
      expect(init.headers['Idempotency-Key']).toMatch(
        /^checkout-pay-1-[0-9a-f]{12}$/,
      );
      const body = JSON.parse(init.body);
      expect(body.pricing.amount).toBe('5000.00');
      expect(body.reference).toBe('pay-1');
      expect(body.metadata).toMatchObject({ k: 'v', supportId: 'sup-1' });
    });
  });

  describe('verifyWebhookSignature', () => {
    const body = JSON.stringify({ id: 'evt_1' });

    it('accepts a correct V2 signature', async () => {
      await expect(
        make().verifyWebhookSignature(sign(body), body),
      ).resolves.toEqual({ isValid: true });
    });

    it('accepts any of several v1 values (secret rotation)', async () => {
      const header = `${sign(body)},v1=${'0'.repeat(64)}`;
      await expect(
        make().verifyWebhookSignature(header, Buffer.from(body)),
      ).resolves.toEqual({ isValid: true });
    });

    it('accepts a signature from any of several endpoint secrets', async () => {
      const p = make({ BACHS_WEBHOOK_SECRET: ` other_secret , ${SECRET} ` });
      await expect(p.verifyWebhookSignature(sign(body), body)).resolves.toEqual(
        { isValid: true },
      );
    });

    it('rejects a tampered body, wrong secret, stale timestamp and junk', async () => {
      const p = make();
      expect(
        (await p.verifyWebhookSignature(sign(body), body + ' ')).isValid,
      ).toBe(false);
      expect(
        (
          await make({ BACHS_WEBHOOK_SECRET: 'other' }).verifyWebhookSignature(
            sign(body),
            body,
          )
        ).isValid,
      ).toBe(false);
      const old = Math.floor(Date.now() / 1000) - 600;
      expect(
        (await p.verifyWebhookSignature(sign(body, old), body)).isValid,
      ).toBe(false);
      expect((await p.verifyWebhookSignature('garbage', body)).isValid).toBe(
        false,
      );
      expect((await p.verifyWebhookSignature('', body)).isValid).toBe(false);
    });
  });

  describe('normalizeWebhook', () => {
    const p = make();

    it('turns a paid checkout into charge.success keyed by checkout id', () => {
      expect(
        p.normalizeWebhook({
          id: 'evt_1',
          type: 'collection.succeeded',
          data: {
            status: 'SUCCEEDED',
            checkout_id: 'chk_1',
            charge_id: 'ch_1',
          },
        }),
      ).toEqual({
        event: 'charge.success',
        event_id: 'evt_1',
        data: { id: 'ch_1', reference: 'chk_1' },
      });
    });

    it('ignores deposits without a checkout and part payments', () => {
      expect(
        p.normalizeWebhook({
          id: 'e',
          type: 'collection.succeeded',
          data: { status: 'SUCCEEDED', checkout_id: null },
        }).event,
      ).toBe('ignored');
      expect(
        p.normalizeWebhook({
          id: 'e',
          type: 'collection.succeeded',
          data: { status: 'ACCEPTED', checkout_id: 'chk_1' },
        }).event,
      ).toBe('ignored');
    });

    it('maps payout and refund events', () => {
      const data = {
        withdrawal_id: 'pay_1',
        reference: 'pyt-1',
        refund_id: 'rf_1',
        charge_id: 'ch_1',
      };
      expect(
        p.normalizeWebhook({ id: 'a', type: 'payout.paid', data }),
      ).toMatchObject({
        event: 'transfer.success',
        data: { id: 'pay_1', reference: 'pyt-1' },
      });
      expect(
        p.normalizeWebhook({ id: 'a', type: 'payout.failed', data }).event,
      ).toBe('transfer.failed');
      expect(
        p.normalizeWebhook({ id: 'a', type: 'refund.paid', data }),
      ).toMatchObject({
        event: 'refund.processed',
        data: { id: 'rf_1', charge_id: 'ch_1' },
      });
      expect(
        p.normalizeWebhook({ id: 'a', type: 'refund.failed', data }).event,
      ).toBe('refund.failed');
      expect(
        p.normalizeWebhook({ id: 'a', type: 'capability.updated', data }).event,
      ).toBe('ignored');
    });
  });

  describe('banks and accounts', () => {
    it('adds a slug made from the bank name', async () => {
      reply(200, { banks: [{ name: 'Guaranty Trust Bank', code: '058' }] });
      await expect(make().listBanks()).resolves.toEqual([
        {
          name: 'Guaranty Trust Bank',
          code: '058',
          slug: 'guaranty-trust-bank',
        },
      ]);
    });

    it('resolves an account and rejects one the bank cannot find', async () => {
      reply(200, {
        resolved: true,
        account_name: 'ADA OBI',
        account_number: '0123456789',
      });
      await expect(make().resolveAccount('0123456789', '058')).resolves.toEqual(
        {
          accountName: 'ADA OBI',
          accountNumber: '0123456789',
        },
      );

      reply(200, {
        resolved: false,
        account_name: null,
        message: 'No such account',
      });
      await expect(make().resolveAccount('1', '058')).rejects.toThrow(
        PaymentProviderRejectedError,
      );
    });
  });

  describe('errors', () => {
    it('treats 4xx as a rejection and 5xx, 429 as unknown outcomes', async () => {
      reply(422, { detail: 'bad' });
      await expect(make().listBanks()).rejects.toThrow(
        PaymentProviderRejectedError,
      );

      reply(500, {});
      const err = await make()
        .listBanks()
        .catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err).not.toBeInstanceOf(PaymentProviderRejectedError);

      reply(429, {});
      expect(
        await make()
          .listBanks()
          .catch((e) => e),
      ).not.toBeInstanceOf(PaymentProviderRejectedError);
    });
  });

  describe('createTransferRecipient', () => {
    const params = {
      accountName: 'ADA CHINEKE OBI',
      accountNumber: '0123456789',
      bankCode: '058',
      creatorId: 'cr-1',
      email: 'ada@example.com',
    };

    it('creates the account, submits the person, then registers the bank account', async () => {
      reply(201, { id: 'acct_1' });
      reply(200, {});
      reply(201, { id: 'pd_1', status: 'approved' });

      const code = await make().createTransferRecipient(params);

      expect(code).toBe('acct_1:pd_1');
      expect(
        fetchMock.mock.calls.map((c) => c[0].replace(/^https:\/\/[^/]+/, '')),
      ).toEqual([
        '/v1/accounts',
        '/v1/accounts/acct_1',
        '/v1/payouts/destinations',
      ]);
      const person = JSON.parse(fetchMock.mock.calls[1][1].body).fields
        .persons[0];
      expect(person).toMatchObject({
        first_name: 'ADA',
        last_name: 'CHINEKE OBI',
      });
      expect(fetchMock.mock.calls[2][1].headers['X-Account-Id']).toBe('acct_1');
    });

    it('reuses the creator’s earlier account', async () => {
      reply(201, { id: 'pd_2', status: 'approved' });

      const code = await make().createTransferRecipient({
        ...params,
        previousRecipientCode: 'acct_1:pd_1',
      });

      expect(code).toBe('acct_1:pd_2');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refuses a rejected destination and a missing email', async () => {
      reply(201, { id: 'acct_1' });
      reply(200, {});
      reply(201, {
        id: 'pd_1',
        status: 'rejected',
        status_reason: 'name mismatch',
      });
      await expect(make().createTransferRecipient(params)).rejects.toThrow(
        'name mismatch',
      );

      await expect(
        make().createTransferRecipient({ ...params, email: undefined }),
      ).rejects.toThrow(PaymentProviderRejectedError);
    });
  });

  describe('initiateTransfer', () => {
    const params = {
      amount: 495_000,
      recipientCode: 'acct_1:pd_1',
      reference: 'pyt-1',
      reason: 'Withdrawal',
    };
    const active = {
      capabilities: {
        transfers: { status: 'active' },
        payouts: { status: 'active' },
      },
    };

    it('funds the account with amount + fee, then pays out the amount', async () => {
      reply(200, active);
      reply(201, { id: 'tr_1' });
      reply(201, { id: 'pay_1', status: 'processing' });

      const res = await make().initiateTransfer(params);

      expect(res).toEqual({
        status: 'PENDING',
        transferCode: 'acct_1:pay_1',
        failureReason: undefined,
      });
      const transfer = fetchMock.mock.calls[1];
      expect(JSON.parse(transfer[1].body)).toMatchObject({
        destination: 'acct_1',
        amount: '5000.00',
      });
      expect(transfer[1].headers['Idempotency-Key']).toBe('transfer-pyt-1');
      const payout = fetchMock.mock.calls[2];
      expect(JSON.parse(payout[1].body)).toMatchObject({
        destination: 'pd_1',
        amount: '4950.00',
        reference: 'pyt-1',
      });
      expect(payout[1].headers['X-Account-Id']).toBe('acct_1');
      expect(payout[1].headers['Idempotency-Key']).toBe('payout-pyt-1');
    });

    it('refuses before moving money when the account is not active', async () => {
      reply(200, {
        capabilities: {
          transfers: { status: 'active' },
          payouts: { status: 'pending' },
        },
      });
      await expect(make().initiateTransfer(params)).rejects.toThrow(
        PaymentProviderRejectedError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a recipient code that is not a Bachs one', async () => {
      await expect(
        make().initiateTransfer({ ...params, recipientCode: 'RCP_1' }),
      ).rejects.toThrow(PaymentProviderRejectedError);
    });

    it('takes the funding back when the payout is rejected', async () => {
      reply(200, active);
      reply(201, { id: 'tr_1' });
      reply(422, { detail: 'invalid destination' });
      reply(201, { id: 'tr_2' });

      await expect(make().initiateTransfer(params)).rejects.toThrow(
        PaymentProviderRejectedError,
      );

      const back = fetchMock.mock.calls[3];
      expect(JSON.parse(back[1].body)).toMatchObject({
        destination: 'self',
        amount: '5000.00',
      });
      expect(back[1].headers['X-Account-Id']).toBe('acct_1');
    });

    it('does not touch the funding when the payout outcome is unknown', async () => {
      reply(200, active);
      reply(201, { id: 'tr_1' });
      reply(500, {});

      await expect(make().initiateTransfer(params)).rejects.not.toBeInstanceOf(
        PaymentProviderRejectedError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('raises a plain error when the funds cannot be returned', async () => {
      reply(200, active);
      reply(201, { id: 'tr_1' });
      reply(422, { detail: 'no' });
      reply(500, {});

      const err = await make()
        .initiateTransfer(params)
        .catch((e) => e);
      expect(err).not.toBeInstanceOf(PaymentProviderRejectedError);
      expect(err.message).toContain('still on Bachs account acct_1');
    });
  });

  describe('verifyTransfer', () => {
    it('maps the payout status', async () => {
      reply(200, { status: 'completed' });
      await expect(
        make().verifyTransfer('r', 'acct_1:pay_1'),
      ).resolves.toMatchObject({
        status: 'SUCCESS',
      });
      reply(200, { status: 'failed', failure_reason: 'Account closed' });
      await expect(
        make().verifyTransfer('r', 'acct_1:pay_1'),
      ).resolves.toMatchObject({
        status: 'FAILED',
        failureReason: 'Account closed',
      });
      reply(200, { status: 'processing' });
      await expect(
        make().verifyTransfer('r', 'acct_1:pay_1'),
      ).resolves.toMatchObject({
        status: 'PENDING',
      });
    });

    it('never says NOT_FOUND: without a code, or when the lookup is refused', async () => {
      await expect(make().verifyTransfer('r', null)).resolves.toEqual({
        status: 'PENDING',
      });
      expect(fetchMock).not.toHaveBeenCalled();

      reply(404, { detail: 'not found' });
      await expect(
        make().verifyTransfer('r', 'acct_1:pay_1'),
      ).resolves.toMatchObject({
        status: 'PENDING',
      });
    });
  });

  describe('refundPayment', () => {
    it('refunds by charge id with a decimal amount', async () => {
      reply(201, { refund_id: 'rf_1', status: 'success' });

      const res = await make().refundPayment({
        paymentReference: 'chk_1',
        providerTransactionId: 'ch_1',
        amount: 250_000,
        reason: 'Requested by supporter',
      });

      expect(res).toEqual({ status: 'PROCESSED', providerRefundId: 'rf_1' });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toMatchObject({
        charge_id: 'ch_1',
        amount: '2500.00',
        reference: 'refund-ch_1',
      });
    });

    it('rejects a payment that has no charge id', async () => {
      await expect(
        make().refundPayment({ paymentReference: 'chk_1', amount: 100 }),
      ).rejects.toThrow(PaymentProviderRejectedError);
    });

    it('maps statuses', () => {
      const p = make();
      expect(p.mapRefundStatus('processing')).toBe('PROCESSING');
      expect(p.mapRefundStatus('failed')).toBe('FAILED');
    });
  });
});
