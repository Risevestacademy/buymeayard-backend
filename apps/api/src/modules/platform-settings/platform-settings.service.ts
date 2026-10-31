import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Prisma } from '@prisma/client';

/** Money values are in kobo (the admin API converts to and from naira). */
export interface PlatformSettings {
  /** Share of each contribution kept by the platform, 0-100. */
  platformFeePercent: number;
  minimumWithdrawal: number;
  /** Withdrawals up to this amount pay `payoutFeeUpToLimit`. */
  payoutFeeTierLimit: number;
  payoutFeeUpToLimit: number;
  payoutFeeAboveLimit: number;
}

export type PayoutRules = Omit<PlatformSettings, 'platformFeePercent'>;

const SETTINGS_KEY = 'platform';
const CACHE_TTL_MS = 30_000;

export const DEFAULT_PAYOUT_RULES: PayoutRules = {
  minimumWithdrawal: 100_000, // ₦1,000
  payoutFeeTierLimit: 5_000_000, // ₦50,000
  payoutFeeUpToLimit: 5_000, // ₦50
  payoutFeeAboveLimit: 10_000, // ₦100
};

/**
 * Admin-editable platform rules. Stored as one JSON row and merged over the
 * defaults, so a missing row or key falls back to the built-in value. Other
 * instances pick up a change within the cache TTL.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private cache: { value: PlatformSettings; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  defaults(): PlatformSettings {
    return {
      platformFeePercent:
        this.configService.get<number>('PLATFORM_FEE_PERCENTAGE') ?? 10,
      ...DEFAULT_PAYOUT_RULES,
    };
  }

  async get(): Promise<PlatformSettings> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.value;
    }
    let row: { value: unknown } | null;
    try {
      row = await this.prisma.platformSetting.findUnique({
        where: { key: SETTINGS_KEY },
      });
    } catch (error) {
      // e.g. the migration has not run yet: keep payments and payouts working
      // on the built-in values instead of failing them
      this.logger.error(
        'Could not read platform settings, using defaults',
        error,
      );
      return this.defaults();
    }
    const value: PlatformSettings = {
      ...this.defaults(),
      ...((row?.value as Partial<PlatformSettings> | null) ?? {}),
    };
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  async save(
    patch: Partial<PlatformSettings>,
    updatedBy: string,
  ): Promise<PlatformSettings> {
    const next: PlatformSettings = { ...(await this.get()), ...patch };
    await this.prisma.platformSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: {
        key: SETTINGS_KEY,
        value: next as unknown as Prisma.InputJsonValue,
        updatedBy,
      },
      update: { value: next as unknown as Prisma.InputJsonValue, updatedBy },
    });
    this.cache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS };
    return next;
  }
}
