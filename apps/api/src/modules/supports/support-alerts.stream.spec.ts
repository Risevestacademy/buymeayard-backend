import { Sse } from '@nestjs/common';
import { firstValueFrom, map } from 'rxjs';
import { NairaResponseInterceptor } from '../../common/interceptors/naira-response.interceptor';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { SupportAlertsService } from './support-alerts.service';

/**
 * The stream as the browser gets it: the service's event, shaped like the
 * controller does, then through both response interceptors.
 */
describe('gift alert stream, end to end', () => {
  class Route {
    @Sse('me/alerts/stream')
    stream() {
      return undefined;
    }
  }

  function open(alerts: SupportAlertsService, userId: string) {
    const gifts$ = alerts
      .streamFor(userId)
      .pipe(map((alert) => ({ type: 'gift', data: alert })));
    const context = { getHandler: () => Route.prototype.stream } as never;
    const naira = new NairaResponseInterceptor().intercept(context, {
      handle: () => gifts$,
    });
    return new TransformInterceptor().intercept(context, {
      handle: () => naira,
    });
  }

  const event = {
    supportId: 's1',
    creatorUserId: 'creator-a',
    supporterName: 'Tomi',
    supporterEmail: 'tomi@example.com',
    yards: 2.5,
    materialName: 'Adire',
    amount: 475_000, // kobo
    message: 'Keep creating',
  };

  it('delivers the gift to the right creator with netAmount in naira', async () => {
    const alerts = new SupportAlertsService();
    const received = firstValueFrom(open(alerts, 'creator-a'));

    alerts.handleContributionReceived(event);

    expect(await received).toEqual({
      type: 'gift',
      data: {
        supportId: 's1',
        supporterName: 'Tomi',
        materialName: 'Adire',
        yards: 2.5,
        netAmount: 4750,
        message: 'Keep creating',
      },
    });
  });

  it('sends nothing to a different creator', async () => {
    const alerts = new SupportAlertsService();
    const seen: unknown[] = [];
    const sub = open(alerts, 'creator-b').subscribe((m) => seen.push(m));

    alerts.handleContributionReceived(event);

    expect(seen).toEqual([]);
    sub.unsubscribe();
  });
});
