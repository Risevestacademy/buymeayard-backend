import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PlatformSettings,
  PlatformSettingsService,
} from '../../platform-settings/platform-settings.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { AdminUpdateSettingsDto } from './admin-settings.dto';

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditLogService,
  ) {}

  async get() {
    return {
      settings: await this.settings.get(),
      defaults: this.settings.defaults(),
    };
  }

  /**
   * Updates the platform rules. Changes apply to new contributions and
   * withdrawals only; existing ones keep the fee they were created with.
   */
  async update(adminId: string, dto: AdminUpdateSettingsDto) {
    const previous = await this.settings.get();
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    ) as Partial<PlatformSettings>;
    const next = { ...previous, ...patch };

    const highestFee = Math.max(
      next.payoutFeeUpToLimit,
      next.payoutFeeAboveLimit,
    );
    if (next.minimumWithdrawal <= highestFee) {
      throw new BadRequestException({
        code: ErrorCodes.INVALID_SETTINGS,
        message:
          'The minimum withdrawal must be higher than the payout fee, or creators would receive nothing',
      });
    }

    const saved = await this.settings.save(patch, adminId);
    await this.audit.record({
      actorId: adminId,
      action: 'admin.settings.updated',
      resourceType: 'PlatformSettings',
      resourceId: 'platform',
      previousState: { ...previous },
      newState: { ...saved },
    });
    return { settings: saved, defaults: this.settings.defaults() };
  }
}
