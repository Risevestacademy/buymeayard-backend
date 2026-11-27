import { Transform } from 'class-transformer';
import { MoneyUtil } from '../utils/money.util';

/**
 * Clients send naira; this turns the field into kobo before validation, so the
 * rest of the code only ever sees kobo. Put it after `@Type(() => Number)`.
 */
export const NairaToKobo = () =>
  Transform(({ value }) =>
    typeof value === 'number' && Number.isFinite(value)
      ? MoneyUtil.toMinorUnits(value)
      : value,
  );
