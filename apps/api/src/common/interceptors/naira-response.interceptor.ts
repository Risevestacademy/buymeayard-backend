import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { MoneyUtil } from '../utils/money.util';

/**
 * Money fields on the creator, payout and payment routes. The database and
 * services work in kobo; the frontends only ever see naira. Only use this on
 * controllers where every field below is stored in kobo.
 */
export const NAIRA_RESPONSE_KEYS = [
  'amount',
  'fee',
  'netAmount',
  'totalAmount',
  'platformFee',
  'creatorAmount',
  'unitPrice',
  'totalPrice',
  'price',
  'defaultPrice',
  'basePrice',
  'availableBalance',
  'pendingBalance',
  'withdrawnToDate',
  'minimumWithdrawal',
  'totalContributionAmount',
  'netEarnings',
  'platformFees',
  'thisMonthAmount',
  'lastMonthAmount',
  'grossAmount',
  'totalGross',
  'totalFees',
  'totalNet',
  'amountRequested',
  'feeCharged',
  'returnedToBalance',
  'transferred',
] as const;

@Injectable()
export class NairaResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((body) => MoneyUtil.toMajorDeep(body, NAIRA_RESPONSE_KEYS)));
  }
}
