import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { toDisplayStatus } from '../payouts/payouts.service';
import {
  CreateSupportTicketDto,
  SupportTicketResponseDto,
} from './dto/support-ticket.dto';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly config: ConfigService,
  ) {}

  /** Stores the message and emails it to the support inbox. */
  async create(
    userId: string,
    input: CreateSupportTicketDto,
  ): Promise<SupportTicketResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    const context: Record<string, Prisma.InputJsonValue> = {};
    if (input.payoutId) {
      context.payout = await this.getPayoutContext(userId, input.payoutId);
    }
    if (input.contributionId) {
      context.contribution = await this.getContributionContext(
        userId,
        input.contributionId,
      );
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId,
        payoutId: input.payoutId,
        supportId: input.contributionId,
        message: input.message,
        context,
      },
    });

    const details = Object.entries(context)
      .flatMap(([, value]) => Object.entries(value as Record<string, unknown>))
      .map(([key, value]) => `<li>${key}: ${escapeHtml(String(value))}</li>`)
      .join('');
    await this.dispatcher.sendEmail(
      this.config.get<string>('SUPPORT_EMAIL') || 'buymeayard@gmail.com',
      `Support request ${ticket.id.slice(0, 8)} from ${user.name || user.email}`,
      `
        <p><strong>From:</strong> ${escapeHtml(user.name || '')} &lt;${escapeHtml(user.email)}&gt;</p>
        <p><strong>Ticket:</strong> ${ticket.id}</p>
        ${details ? `<ul>${details}</ul>` : ''}
        <p style="white-space:pre-wrap;">${escapeHtml(input.message)}</p>
      `,
    );

    return {
      id: ticket.id,
      status: ticket.status,
      createdAt: ticket.createdAt,
    };
  }

  private async getPayoutContext(userId: string, payoutId: string) {
    const payout = await this.prisma.payout.findFirst({
      where: { id: payoutId, creator: { userId } },
    });
    if (!payout) {
      throw new NotFoundException({
        code: ErrorCodes.PAYOUT_NOT_FOUND,
        message: 'Payout not found',
      });
    }
    return {
      reference: payout.reference ?? payout.id,
      amount: payout.amount,
      netAmount: payout.netAmount,
      status: toDisplayStatus(payout.status),
      requestedAt: payout.requestedAt.toISOString(),
      destination:
        `${payout.bankName ?? ''} ••••${payout.accountNumberLast4 ?? ''}`.trim(),
    };
  }

  /** The contribution, if the user is the creator who received it. */
  private async getContributionContext(userId: string, supportId: string) {
    const support = await this.prisma.support.findFirst({
      where: {
        id: supportId,
        creator: { userId },
      },
    });
    if (!support) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Contribution not found',
      });
    }
    return {
      contributionId: support.id,
      amount: support.creatorAmount,
      status: support.status,
      createdAt: support.createdAt.toISOString(),
    };
  }
}
