import { Job } from 'bullmq';
import { PushProcessor } from './push.processor';
import { PUSH_JOBS, RECEIPT_DELAY_MS } from './push.constants';

const A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

describe('PushProcessor', () => {
  let expo: {
    chunkPushNotifications: jest.Mock;
    sendPushNotificationsAsync: jest.Mock;
    chunkPushNotificationReceiptIds: jest.Mock;
    getPushNotificationReceiptsAsync: jest.Mock;
  };
  let queue: { add: jest.Mock };
  let tokens: {
    findForUser: jest.Mock;
    removeInvalid: jest.Mock;
  };
  let processor: PushProcessor;

  beforeEach(() => {
    expo = {
      chunkPushNotifications: jest.fn((m) => [m]),
      sendPushNotificationsAsync: jest.fn(),
      chunkPushNotificationReceiptIds: jest.fn((ids) => [ids]),
      getPushNotificationReceiptsAsync: jest.fn(),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    tokens = {
      findForUser: jest.fn().mockResolvedValue([A, B, 'not-a-token']),
      removeInvalid: jest.fn().mockResolvedValue(undefined),
    };
    processor = new PushProcessor(
      expo as never,
      queue as never,
      tokens as never,
    );
  });

  const job = (name: string, data: unknown) => ({ name, data }) as Job;

  it('sends to every device, drops stale tokens and schedules the receipt check', async () => {
    expo.sendPushNotificationsAsync.mockResolvedValue([
      { status: 'ok', id: 'T1' },
      {
        status: 'error',
        message: 'gone',
        details: { error: 'DeviceNotRegistered' },
      },
    ]);

    await processor.process(
      job(PUSH_JOBS.SEND, {
        userId: 'u1',
        payload: { title: 't', body: 'b', data: { url: '/x' } },
      }),
    );

    const messages = expo.chunkPushNotifications.mock.calls[0][0];
    expect(messages.map((m: any) => m.to)).toEqual([A, B]);
    expect(messages[0]).toMatchObject({
      title: 't',
      body: 'b',
      data: { url: '/x' },
      channelId: 'default',
    });
    expect(tokens.removeInvalid).toHaveBeenCalledWith([B]);
    expect(queue.add).toHaveBeenCalledWith(
      PUSH_JOBS.RECEIPTS,
      { tickets: { T1: A } },
      expect.objectContaining({ delay: RECEIPT_DELAY_MS }),
    );
  });

  it('does nothing when the user has no tokens', async () => {
    tokens.findForUser.mockResolvedValue([]);
    await processor.process(
      job(PUSH_JOBS.SEND, { userId: 'u1', payload: { title: 't', body: 'b' } }),
    );
    expect(expo.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it('deletes tokens whose receipt says DeviceNotRegistered', async () => {
    expo.getPushNotificationReceiptsAsync.mockResolvedValue({
      T1: { status: 'ok' },
      T2: {
        status: 'error',
        message: 'gone',
        details: { error: 'DeviceNotRegistered' },
      },
      T3: {
        status: 'error',
        message: 'slow down',
        details: { error: 'MessageRateExceeded' },
      },
    });

    await processor.process(
      job(PUSH_JOBS.RECEIPTS, { tickets: { T1: A, T2: B, T3: A } }),
    );

    expect(tokens.removeInvalid).toHaveBeenCalledWith([B]);
  });
});
