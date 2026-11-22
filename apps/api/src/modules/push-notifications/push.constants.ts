export const PUSH_QUEUE = 'push';
export const EXPO_CLIENT = 'EXPO_CLIENT';

export const PUSH_JOBS = {
  SEND: 'send',
  RECEIPTS: 'receipts',
} as const;

/** Expo asks for receipts to be read at least 15 minutes after sending. */
export const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export interface PushPayload {
  title: string;
  body: string;
  /** `data.url` is the in-app route opened on tap; also carries related ids. */
  data?: Record<string, unknown>;
}

export interface SendPushJob {
  userId: string;
  payload: PushPayload;
}

export interface ReceiptsJob {
  /** ticket id -> push token it was issued for */
  tickets: Record<string, string>;
}
