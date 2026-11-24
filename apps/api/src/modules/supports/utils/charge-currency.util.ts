import { MoneyUtil } from '../../../common/utils/money.util';
import {
  MAX_GIFT_AMOUNT_NAIRA,
  MIN_GIFT_AMOUNT_NAIRA,
} from '../../creators/dto/create-support-intent.dto';

export const LEDGER_CURRENCY = 'NGN';

/**
 * Currencies a supporter can be charged in. Only two-decimal currencies, since
 * every amount is stored in hundredths (UGX, XOF and the like have none).
 * A currency is offered once an admin sets its rate.
 */
export const CHARGE_CURRENCIES = ['NGN', 'USD', 'GHS', 'KES'] as const;
export type ChargeCurrency = (typeof CHARGE_CURRENCIES)[number];

/** NGN per 1 unit of each currency, set by an admin. NGN is always 1. */
export type CurrencyRates = Record<string, number>;

export function isChargeCurrency(code: string): code is ChargeCurrency {
  return (CHARGE_CURRENCIES as readonly string[]).includes(code);
}

/** The currency to charge in: the one asked for if it has a rate, else NGN. */
export function resolveChargeCurrency(
  requested: string | undefined,
  rates: CurrencyRates,
): { currency: string; rate: number } {
  const code = requested?.trim().toUpperCase();
  const rate = code ? rates[code] : undefined;
  if (
    code &&
    code !== LEDGER_CURRENCY &&
    isChargeCurrency(code) &&
    rate !== undefined &&
    rate > 0
  ) {
    return { currency: code, rate };
  }
  return { currency: LEDGER_CURRENCY, rate: 1 };
}

/** Turns an amount in the charge currency (major units) into ledger kobo. */
export function toLedgerMinor(chargeMajor: number, rate: number): number {
  return Math.round(chargeMajor * rate * 100);
}

/** Charge-currency amount in minor units, as sent to Bachs. */
export function toChargeMinor(chargeMajor: number): number {
  return MoneyUtil.toMinorUnits(chargeMajor);
}

/**
 * Smallest and largest gift in a currency (major units), from the naira limits
 * at its rate. The minimum rounds up and the maximum down, so any amount
 * inside the range is accepted.
 */
export function giftLimits(rate: number): {
  minAmount: number;
  maxAmount: number;
} {
  return {
    minAmount: Math.ceil((MIN_GIFT_AMOUNT_NAIRA / rate) * 100) / 100,
    maxAmount: Math.floor((MAX_GIFT_AMOUNT_NAIRA / rate) * 100) / 100,
  };
}
