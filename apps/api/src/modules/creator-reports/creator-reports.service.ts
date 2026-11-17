import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import {
  ReportCreatorDto,
  ReportCreatorResponseDto,
} from './dto/report-creator.dto';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );

@Injectable()
export class CreatorReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly config: ConfigService,
  ) {}

  /** Stores the report and emails it to the support inbox. */
  async report(
    slug: string,
    input: ReportCreatorDto,
  ): Promise<ReportCreatorResponseDto> {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { slug, isPublished: true },
      select: { id: true, slug: true, creatorName: true },
    });
    if (!creator) {
      throw new NotFoundException({
        code: ErrorCodes.CREATOR_NOT_FOUND,
        message: 'Creator not found',
      });
    }

    const report = await this.prisma.creatorReport.create({
      data: {
        creatorId: creator.id,
        reason: input.reason,
        description: input.description,
        reporterEmail: input.reporterEmail || null,
      },
    });

    // The report is saved either way; sendEmail never throws.
    await this.dispatcher.sendEmail(
      this.config.get<string>('SUPPORT_EMAIL') || 'buymeayard@gmail.com',
      `Creator report ${report.id.slice(0, 8)}: ${input.reason}`,
      `
        <p><strong>Creator:</strong> ${escapeHtml(creator.creatorName || creator.slug)} (/${escapeHtml(creator.slug)})</p>
        <p><strong>Reason:</strong> ${input.reason}</p>
        <p><strong>Reporter:</strong> ${input.reporterEmail ? escapeHtml(input.reporterEmail) : 'not given'}</p>
        <p><strong>Report:</strong> ${report.id}</p>
        <p style="white-space:pre-wrap;">${escapeHtml(input.description)}</p>
      `,
    );

    return { id: report.id, status: report.status };
  }
}
