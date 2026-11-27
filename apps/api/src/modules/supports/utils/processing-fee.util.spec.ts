import { processingFeeFor } from './processing-fee.util';

describe('processingFeeFor', () => {
  it('is zero when no fee is set', () => {
    expect(processingFeeFor(500_000, 0)).toBe(0);
  });

  it('grosses the gift up so the fee leaves the gift whole', () => {
    // 500,000 / 0.985 = 507,615 (rounded up)
    expect(processingFeeFor(500_000, 1.5)).toBe(7_615);
  });
});
