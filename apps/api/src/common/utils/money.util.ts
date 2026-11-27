/**
 * Helper utilities for monetary calculations in integer minor units (e.g. Kobo for NGN).
 * 1 NGN = 100 Kobo.
 */
export class MoneyUtil {
  /**
   * Converts major units (e.g. 5,000 NGN) to minor units (500,000 Kobo).
   */
  static toMinorUnits(amountInMajor: number): number {
    return Math.round(amountInMajor * 100);
  }

  /**
   * Converts minor units (e.g. 500,000 Kobo) to major units (5,000 NGN).
   */
  static toMajorUnits(amountInMinor: number): number {
    return amountInMinor / 100;
  }

  /**
   * Copies `value` with every number stored under one of `keys` converted from
   * minor to major units, at any depth. For raw database rows whose money
   * fields all carry stable names. Dates and Decimals are left alone.
   */
  static toMajorDeep<T>(value: T, keys: readonly string[]): T {
    if (Array.isArray(value)) {
      return value.map((v) => MoneyUtil.toMajorDeep(v, keys)) as T;
    }
    if (
      value === null ||
      typeof value !== 'object' ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        typeof v === 'number' && keys.includes(k)
          ? MoneyUtil.toMajorUnits(v)
          : MoneyUtil.toMajorDeep(v, keys);
    }
    return out as T;
  }

  /**
   * Calculates platform fee and creator amount from total minor units and percentage fee.
   */
  static calculateSplit(
    totalAmountMinor: number,
    platformFeePercentage: number,
  ): { platformFee: number; creatorAmount: number } {
    if (totalAmountMinor <= 0) {
      throw new Error('Total amount must be greater than 0');
    }
    if (platformFeePercentage < 0 || platformFeePercentage > 100) {
      throw new Error('Platform fee percentage must be between 0 and 100');
    }

    const platformFee = Math.round(
      (totalAmountMinor * platformFeePercentage) / 100,
    );
    const creatorAmount = totalAmountMinor - platformFee;

    return {
      platformFee,
      creatorAmount,
    };
  }
}
