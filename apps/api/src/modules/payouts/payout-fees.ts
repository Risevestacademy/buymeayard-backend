import {
  DEFAULT_PAYOUT_RULES,
  PayoutRules,
} from '../platform-settings/platform-settings.service';

/**
 * Withdrawal rules shown on the Payouts screens. Amounts are in kobo. The
 * values are admin-editable (see PlatformSettingsService); these are the
 * built-in defaults.
 */

/** "Minimum withdrawal: ₦1,000" */
export const MINIMUM_WITHDRAWAL = DEFAULT_PAYOUT_RULES.minimumWithdrawal;

/** The processing fee is taken out of the withdrawal amount. */
export function calculatePayoutFee(
  amount: number,
  rules: PayoutRules = DEFAULT_PAYOUT_RULES,
): number {
  return amount <= rules.payoutFeeTierLimit
    ? rules.payoutFeeUpToLimit
    : rules.payoutFeeAboveLimit;
}
