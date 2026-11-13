import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  PUSH_JOBS,
  PUSH_QUEUE,
  PushPayload,
  SendPushJob,
} from './push.constants';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(@InjectQueue(PUSH_QUEUE) private readonly queue: Queue) {}

  /**
   * Queues a push to every device of the user. Never throws: a failed push
   * must not break the request or webhook that triggered it.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      const job: SendPushJob = { userId, payload };
      await this.queue.add(PUSH_JOBS.SEND, job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 1000,
      });
    } catch (err) {
      this.logger.error(`Could not queue push for user ${userId}`, err);
    }
  }
}
