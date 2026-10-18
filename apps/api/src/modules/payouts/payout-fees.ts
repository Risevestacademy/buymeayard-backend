/**
 * Withdrawal rules shown on the Payouts screens. Amounts are in kobo.
 */

/** "Minimum withdrawal: ₦1,000" */
export const MINIMUM_WITHDRAWAL = 100_000;

/** Withdrawals above ₦50,000 pay the higher fee. */
const FEE_TIER_LIMIT = 5_000_000;
const FEE_UP_TO_LIMIT = 5_000; // ₦50
const FEE_ABOVE_LIMIT = 10_000; // ₦100

/** The processing fee is taken out of the withdrawal amount. */
export function calculatePayoutFee(amount: number): number {
  return amount <= FEE_TIER_LIMIT ? FEE_UP_TO_LIMIT : FEE_ABOVE_LIMIT;
}
