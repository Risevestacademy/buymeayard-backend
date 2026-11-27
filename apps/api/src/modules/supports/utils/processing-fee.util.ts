/**
 * Bachs's card fee, added on top of the gift so that after Bachs takes its
 * percentage the gift is still whole. All amounts are minor units.
 */
export function processingFeeFor(giftMinor: number, percent: number): number {
  if (percent <= 0) return 0;
  const payable = Math.ceil(giftMinor / (1 - percent / 100));
  return payable - giftMinor;
}
