import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PlatformSettings,
  PlatformSettingsService,
} from '../../platform-settings/platform-settings.service';
import { AuditLogService } from '../../analytics/audit-log.service';
import { ErrorCodes } from '../../../common/errors/error-codes';
import { MoneyUtil } from '../../../common/utils/money.util';
import { AdminUpdateSettingsDto } from './admin-settings.dto';

const MONEY_KEYS = [
  'minimumWithdrawal',
  'payoutFeeTierLimit',
  'payoutFeeUpToLimit',
  'payoutFeeAboveLimit',
] as const;

/** Rules are stored in kobo; admins read and write naira. */
function toNaira(settings: PlatformSettings): PlatformSettings {
  return MoneyUtil.toMajorDeep(settings, MONEY_KEYS);
}

function toKobo(patch: Partial<PlatformSettings>): Partial<PlatformSettings> {
  const out = { ...patch };
  for (const key of MONEY_KEYS) {
    const value = out[key];
    if (value !== undefined) out[key] = MoneyUtil.toMinorUnits(value);
  }
  return out;
}

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditLogService,
  ) {}

  async get() {
    return {
      settings: toNaira(await this.settings.get()),
      defaults: toNaira(this.settings.defaults()),
    };
  }

  /**
   * Updates the platform rules. Changes apply to new contributions and
   * withdrawals only; existing ones keep the fee they were created with.
   */
  async update(adminId: string, dto: AdminUpdateSettingsDto) {
    const previous = await this.settings.get();
    const patch = toKobo(
      Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined),
      ),
    );
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
    return {
      settings: toNaira(saved),
      defaults: toNaira(this.settings.defaults()),
    };
  }
}
