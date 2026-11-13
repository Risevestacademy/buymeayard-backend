import { Inject, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PushTokensService } from './push-tokens.service';
import {
  EXPO_CLIENT,
  PUSH_JOBS,
  PUSH_QUEUE,
  RECEIPT_DELAY_MS,
  ReceiptsJob,
  SendPushJob,
} from './push.constants';

const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

@Processor(PUSH_QUEUE)
export class PushProcessor extends WorkerHost {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(
    @Inject(EXPO_CLIENT) private readonly expo: Expo,
    @InjectQueue(PUSH_QUEUE) private readonly queue: Queue,
    private readonly tokens: PushTokensService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === PUSH_JOBS.SEND) {
      return this.send(job.data as SendPushJob);
    }
    if (job.name === PUSH_JOBS.RECEIPTS) {
      return this.checkReceipts(job.data as ReceiptsJob);
    }
  }

  private async send({ userId, payload }: SendPushJob): Promise<void> {
    const tokens = (await this.tokens.findForUser(userId)).filter((t) =>
      Expo.isExpoPushToken(t),
    );
    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      sound: 'default',
      channelId: 'default', // must match the Android channel the app creates
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
    }));

    const invalid: string[] = [];
    const pending: Record<string, string> = {};

    // Expo accepts at most 100 messages per request; the SDK chunks for us.
    let offset = 0;
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      const chunkTokens = tokens.slice(offset, offset + chunk.length);
      offset += chunk.length;
      // A chunk that throws is retried by BullMQ, which re-sends the whole job.
      const tickets = await this.expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket: ExpoPushTicket, i) => {
        if (ticket.status === 'ok') {
          pending[ticket.id] = chunkTokens[i];
        } else if (ticket.details?.error === DEVICE_NOT_REGISTERED) {
          invalid.push(chunkTokens[i]);
        } else {
          this.logger.warn(
            `Expo rejected a push for user ${userId}: ${ticket.message}`,
          );
        }
      });
    }

    await this.tokens.removeInvalid(invalid);

    if (Object.keys(pending).length > 0) {
      const receipts: ReceiptsJob = { tickets: pending };
      await this.queue.add(PUSH_JOBS.RECEIPTS, receipts, {
        delay: RECEIPT_DELAY_MS,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      });
    }
  }

  /** Receipts reveal tokens that went stale after the message was accepted. */
  private async checkReceipts({ tickets }: ReceiptsJob): Promise<void> {
    const invalid: string[] = [];

    for (const ids of this.expo.chunkPushNotificationReceiptIds(
      Object.keys(tickets),
    )) {
      const receipts = await this.expo.getPushNotificationReceiptsAsync(ids);
      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status !== 'error') continue;
        if (receipt.details?.error === DEVICE_NOT_REGISTERED) {
          invalid.push(tickets[id]);
        } else {
          this.logger.warn(
            `Expo push receipt error (${receipt.details?.error ?? 'unknown'}): ${receipt.message}`,
          );
        }
      }
    }

    await this.tokens.removeInvalid(invalid);
  }
}
