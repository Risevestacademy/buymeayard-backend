import { MoneyUtil } from './money.util';

describe('MoneyUtil', () => {
  describe('toMinorUnits', () => {
    it('should convert NGN 5,000 to 500,000 kobo', () => {
      expect(MoneyUtil.toMinorUnits(5000)).toBe(500000);
    });

    it('should convert NGN 0.50 to 50 kobo', () => {
      expect(MoneyUtil.toMinorUnits(0.5)).toBe(50);
    });
  });

  describe('toMajorUnits', () => {
    it('should convert 500,000 kobo to NGN 5,000', () => {
      expect(MoneyUtil.toMajorUnits(500000)).toBe(5000);
    });
  });

  describe('calculateSplit', () => {
    it('should calculate 10% platform fee and 90% creator earnings on ₦10,000 (1,000,000 kobo)', () => {
      const split = MoneyUtil.calculateSplit(1000000, 10);
      expect(split.platformFee).toBe(100000);
      expect(split.creatorAmount).toBe(900000);
      expect(split.platformFee + split.creatorAmount).toBe(1000000);
    });

    it('should throw if total amount is <= 0', () => {
      expect(() => MoneyUtil.calculateSplit(0, 10)).toThrow(
        'Total amount must be greater than 0',
      );
    });

    it('should throw if percentage fee is out of range', () => {
      expect(() => MoneyUtil.calculateSplit(10000, 150)).toThrow(
        'Platform fee percentage must be between 0 and 100',
      );
    });
  });
});
