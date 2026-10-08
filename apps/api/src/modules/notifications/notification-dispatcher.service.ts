import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import * as nodemailer from 'nodemailer';
import {
  PayoutNotificationEvent,
  ContributionNotificationEvent,
  NewDeviceLoginEvent,
  KycNotificationEvent,
} from './events/notification.events';

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private smtpTransport: nodemailer.Transporter;
  private readonly emailFrom: string;
  private readonly frontendUrl: string;

  constructor(private readonly prisma: PrismaService) {
    this.emailFrom =
      process.env.EMAIL_FROM || 'BuyMeAYard <buymeayard@gmail.com>';
    this.frontendUrl =
      process.env.CREATOR_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';

    const smtpPort = parseInt(process.env.SMTP_PORT || '587');
    this.smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
      port: smtpPort,
      secure: smtpPort === 465,
      connectionTimeout: 5000,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Helper to send an HTML email via Brevo HTTPS or SMTP fallback.
   */
  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      if (process.env.BREVO_API_KEY) {
        const match = this.emailFrom.match(/^(?:(.*)<)?([^>]+)>?$/);
        const senderName = match?.[1]?.trim() || 'BuyMeAYard';
        const senderEmail =
          match?.[2]?.trim() || process.env.SMTP_USER || 'buymeayard@gmail.com';

        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
          }),
        });

        if (res.ok) {
          this.logger.log(`[Email] Brevo API email sent to ${to}: ${subject}`);
          return;
        }
      }

      await this.smtpTransport.sendMail({
        from: this.emailFrom,
        to,
        subject,
        html,
      });
      this.logger.log(`[Email] SMTP email sent to ${to}: ${subject}`);
    } catch (err) {
      this.logger.error(`[Email] Failed sending email to ${to}:`, err);
    }
  }

  /**
   * Gets or initializes user notification preferences.
   */
  private async getPreferences(userId: string) {
    let prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await this.prisma.notificationPreference.create({
        data: {
          userId,
          emailOnContribution: true,
          inAppOnContribution: true,
          pushOnContribution: true,
          emailOnPayout: true,
          inAppOnPayout: true,
          pushOnPayout: true,
          emailOnSecurityAlert: true,
          inAppOnSecurityAlert: true,
          pushOnSecurityAlert: true,
          emailOnProductUpdates: false,
          emailOnCreatorTips: false,
        },
      });
    }

    return prefs;
  }

  /**
   * 1. PAYOUT NOTIFICATIONS (CREATED, PROCESSING, SUCCESS, FAILED)
   */
  async dispatchPayoutNotification(
    event: PayoutNotificationEvent,
    stage: 'CREATED' | 'PROCESSING' | 'SUCCESS' | 'FAILED',
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: event.creatorUserId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return;

    const prefs = await this.getPreferences(user.id);
    const formattedAmount = (event.amount / 100).toLocaleString();
    const bankLabel = event.bankName
      ? `${event.bankName} (${event.accountNumberMasked || '••••'})`
      : 'your registered bank account';

    let title = '';
    let body = '';
    let type = '';
    let emailSubject = '';
    let emailHtml = '';

    switch (stage) {
      case 'CREATED':
        type = 'PAYOUT_CREATED';
        title = 'Withdrawal submitted';
        body = `₦${formattedAmount} withdrawal requested to ${bankLabel}. It typically arrives in 1-2 business days.`;
        emailSubject = 'Withdrawal Submitted - Buy Me a Yard';
        emailHtml = `
          <h2>Withdrawal Request Received</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Your withdrawal request for <strong>₦${formattedAmount}</strong> to ${bankLabel} has been submitted.</p>
          <p>We'll notify you as soon as the funds land in your account.</p>
        `;
        break;

      case 'PROCESSING':
        type = 'PAYOUT_PROCESSING';
        title = 'Payout in progress';
        body = `Your withdrawal of ₦${formattedAmount} is being processed by the bank.`;
        emailSubject = 'Payout Processing - Buy Me a Yard';
        emailHtml = `
          <h2>Payout Processing</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Your withdrawal of <strong>₦${formattedAmount}</strong> is currently being processed by the bank.</p>
        `;
        break;

      case 'SUCCESS':
        type = 'PAYOUT_COMPLETED';
        title = 'Money landed';
        body = `₦${formattedAmount} has been deposited into your ${bankLabel}.`;
        emailSubject = 'Money Landed! Withdrawal Successful - Buy Me a Yard';
        emailHtml = `
          <h2>Money Landed!</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Great news! <strong>₦${formattedAmount}</strong> has been successfully deposited into your ${bankLabel}.</p>
        `;
        break;

      case 'FAILED':
        type = 'PAYOUT_FAILED';
        title = 'Withdrawal failed';
        body = `Your withdrawal of ₦${formattedAmount} could not be completed. Your funds have been returned to your balance.`;
        emailSubject = 'Withdrawal Did Not Go Through - Buy Me a Yard';
        emailHtml = `
          <h2>Withdrawal Did Not Go Through</h2>
          <p>Hi ${user.name || 'there'},</p>
          <p>Your withdrawal of ₦${formattedAmount} could not be processed.</p>
          <p><strong>Your funds have been safely returned to your available balance.</strong></p>
          <p>${event.failureReason ? `Reason: ${event.failureReason}` : 'Please review your bank details and try again.'}</p>
        `;
        break;
    }

    // In-App Notification (always on for financial events)
    if (prefs.inAppOnPayout !== false) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          category: 'PAYOUT',
          type,
          title,
          body,
          data: {
            payoutId: event.payoutId,
            amount: event.amount,
            bankName: event.bankName,
            accountNumberMasked: event.accountNumberMasked,
          },
          actionUrl: '/dashboard/payouts',
        },
      });
    }

    // Email Notification
    if (prefs.emailOnPayout !== false && user.email) {
      await this.sendEmail(user.email, emailSubject, emailHtml);
    }
  }

  /**
   * 2. CONTRIBUTION NOTIFICATIONS (received by creator)
   */
  async dispatchContributionNotification(
    event: ContributionNotificationEvent,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: event.creatorUserId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return;

    const prefs = await this.getPreferences(user.id);
    const formattedAmount = (event.amount / 100).toLocaleString();
    const noteSnippet = event.message ? ` — "${event.message}"` : '';

    const title = 'New contribution received!';
    const body = `${event.supporterName} bought ${event.yards} yards of ${event.materialName} (₦${formattedAmount})${noteSnippet}`;

    // In-App Drawer Notification
    if (prefs.inAppOnContribution) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          category: 'CONTRIBUTION',
          type: 'CONTRIBUTION_RECEIVED',
          title,
          body,
          data: {
            supportId: event.supportId,
            supporterName: event.supporterName,
            yards: event.yards,
            materialName: event.materialName,
            amount: event.amount,
            message: event.message,
          },
          actionUrl: '/dashboard/contributions',
        },
      });
    }

    // Email Notification
    if (prefs.emailOnContribution && user.email) {
      const emailSubject = `🎉 ${event.supporterName} just supported you with ${event.yards} yards!`;
      const emailHtml = `
        <h2>You received a new contribution!</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p><strong>${event.supporterName}</strong> just bought <strong>${event.yards} yards</strong> of <strong>${event.materialName}</strong> (₦${formattedAmount}).</p>
        ${
          event.message
            ? `<blockquote><p>"${event.message}"</p></blockquote>`
            : ''
        }
        <p><a href="${this.frontendUrl}/dashboard/contributions" style="padding: 10px 18px; background: #16a34a; color: white; text-decoration: none; border-radius: 6px;">View in Dashboard</a></p>
      `;
      await this.sendEmail(user.email, emailSubject, emailHtml);
    }
  }

  /**
   * 3. SECURITY ALERT: NEW DEVICE / LOCATION LOGIN
   */
  async dispatchSecurityAlertNotification(event: NewDeviceLoginEvent) {
    const prefs = await this.getPreferences(event.userId);

    const title = 'New sign-in detected';
    const body = `A new sign-in was detected on ${event.deviceLabel} from ${event.location}. If this wasn't you, review your active sessions.`;

    // In-App Alert
    if (prefs.inAppOnSecurityAlert !== false) {
      await this.prisma.notification.create({
        data: {
          userId: event.userId,
          category: 'SECURITY',
          type: 'NEW_DEVICE_LOGIN',
          title,
          body,
          data: {
            device: event.deviceLabel,
            location: event.location,
            ipAddress: event.ipAddress,
            sessionId: event.sessionId,
          },
          actionUrl: '/settings/security',
        },
      });
    }

    // Urgent Security Alert Email
    if (prefs.emailOnSecurityAlert !== false && event.email) {
      const emailSubject = '⚠️ New sign-in detected on your Buy Me a Yard account';
      const emailHtml = `
        <h2>New Sign-in Detected</h2>
        <p>We detected a new sign-in to your account:</p>
        <ul>
          <li><strong>Device:</strong> ${event.deviceLabel}</li>
          <li><strong>Location:</strong> ${event.location}</li>
          ${event.ipAddress ? `<li><strong>IP Address:</strong> ${event.ipAddress}</li>` : ''}
          <li><strong>Time:</strong> ${new Date().toUTCString()}</li>
        </ul>
        <p>If this was you, you can ignore this email.</p>
        <p>If you don't recognize this activity, please secure your account immediately and sign out of all other devices:</p>
        <p><a href="${this.frontendUrl}/settings/security" style="padding: 10px 18px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px;">Review Active Sessions</a></p>
      `;
      await this.sendEmail(event.email, emailSubject, emailHtml);
    }
  }

  /**
   * 4. KYC STATUS UPDATES
   */
  async dispatchKycNotification(event: KycNotificationEvent) {
    const user = await this.prisma.user.findUnique({
      where: { id: event.creatorUserId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return;

    if (event.status === 'VERIFIED') {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          category: 'KYC',
          type: 'KYC_VERIFIED',
          title: 'Identity verified',
          body: "You're verified and can withdraw your earnings.",
          actionUrl: '/settings/account',
        },
      });

      if (user.email) {
        await this.sendEmail(
          user.email,
          'Identity Verified - Buy Me a Yard',
          `<h2>You're verified!</h2><p>Your identity verification is approved. You can now withdraw all your earnings.</p>`,
        );
      }
    } else if (
      event.status === 'NEEDS_ATTENTION' ||
      event.status === 'REJECTED'
    ) {
      const reason =
        event.rejectionReason ||
        'Please upload a valid, unexpired government ID and try again.';

      await this.prisma.notification.create({
        data: {
          userId: user.id,
          category: 'KYC',
          type: 'KYC_ACTION_REQUIRED',
          title: 'Verification needs attention',
          body: reason,
          actionUrl: '/settings/account',
        },
      });

      if (user.email) {
        await this.sendEmail(
          user.email,
          'Identity Verification Needs Attention - Buy Me a Yard',
          `<h2>Action Required: Identity Verification</h2><p>${reason}</p><p><a href="${this.frontendUrl}/settings/account">Try Again</a></p>`,
        );
      }
    }
  }
}
