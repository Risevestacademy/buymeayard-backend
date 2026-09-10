export interface SendNotificationPayload {
  recipientId: string;
  recipientEmail?: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';

export interface NotificationProvider {
  send(payload: SendNotificationPayload): Promise<void>;
}
