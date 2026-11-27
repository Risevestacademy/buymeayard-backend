import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service';
import { ErrorCodes } from '../../common/errors/error-codes';
import { STORAGE_PROVIDER } from '../../infrastructure/storage/storage-provider.interface';
import type { StorageProvider } from '../../infrastructure/storage/storage-provider.interface';
import {
  CREATOR_REPORT_REASON_LABELS,
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
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private readonly logger = new Logger(CreatorReportsService.name);

  /** Stores the report and emails it to the support inbox. */
  async report(
    slug: string,
    input: ReportCreatorDto,
    file?: Express.Multer.File,
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

    const evidenceLinks = [input.evidenceLink1, input.evidenceLink2].filter(
      (l): l is string => Boolean(l),
    );
    const evidenceFileUrl = file ? await this.uploadEvidence(file) : null;

    const report = await this.prisma.creatorReport.create({
      data: {
        creatorId: creator.id,
        reason: input.reason,
        description: input.description,
        reporterEmail: input.reporterEmail,
        evidenceLinks,
        evidenceFileUrl,
      },
    });

    const reasonLabel = CREATOR_REPORT_REASON_LABELS[input.reason];

    // The report is saved either way; sendEmail never throws.
    await this.dispatcher.sendEmail(
      this.config.get<string>('SUPPORT_EMAIL') || 'buymeayard@gmail.com',
      `Creator report ${report.id.slice(0, 8)}: ${reasonLabel}`,
      `
        <p><strong>Creator:</strong> ${escapeHtml(creator.creatorName || creator.slug)} (/${escapeHtml(creator.slug)})</p>
        <p><strong>Reason:</strong> ${escapeHtml(reasonLabel)}</p>
        <p><strong>Reporter:</strong> ${escapeHtml(input.reporterEmail)}</p>
        <p><strong>Report:</strong> ${report.id}</p>
        <p style="white-space:pre-wrap;">${escapeHtml(input.description)}</p>
        <p><strong>Evidence:</strong></p>
        <ul>${[...evidenceLinks, ...(evidenceFileUrl ? [evidenceFileUrl] : [])]
          .map(
            (u) => `<li><a href="${escapeHtml(u)}">${escapeHtml(u)}</a></li>`,
          )
          .join('')}</ul>
      `,
    );

    return { id: report.id, status: report.status };
  }

  /** Stores the optional evidence file and returns its link. */
  private async uploadEvidence(file: Express.Multer.File): Promise<string> {
    try {
      const result = await this.storage.uploadFile(file.buffer, {
        folder: 'report-evidence',
        resourceType: 'auto',
      });
      return result.secureUrl;
    } catch (error) {
      this.logger.error(`Report evidence upload failed: ${String(error)}`);
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'We could not upload your file. Try again.',
      });
    }
  }
}
