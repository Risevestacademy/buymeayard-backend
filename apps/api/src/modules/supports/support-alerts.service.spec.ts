import { SupportAlertsService, GiftAlert } from './support-alerts.service';
import { ContributionNotificationEvent } from '../notifications/events/notification.events';

describe('SupportAlertsService', () => {
  let service: SupportAlertsService;

  const makeEvent = (
    overrides: Partial<ContributionNotificationEvent> = {},
  ): ContributionNotificationEvent => ({
    supportId: 'support-1',
    creatorUserId: 'creator-1',
    supporterName: 'Ada',
    supporterEmail: 'ada@example.com',
    yards: 2,
    materialName: 'Ankara',
    amount: 475000,
    message: 'Well done',
    ...overrides,
  });

  beforeEach(() => {
    service = new SupportAlertsService();
  });

  it('delivers a gift to the creator it belongs to, without private fields', () => {
    const received: GiftAlert[] = [];
    service.streamFor('creator-1').subscribe((a) => received.push(a));

    service.handleContributionReceived(makeEvent());

    expect(received).toEqual([
      {
        supportId: 'support-1',
        supporterName: 'Ada',
        materialName: 'Ankara',
        yards: 2,
        netAmount: 475000,
        message: 'Well done',
      },
    ]);
  });

  it('sends nothing to a different creator', () => {
    const received: GiftAlert[] = [];
    service.streamFor('creator-2').subscribe((a) => received.push(a));

    service.handleContributionReceived(makeEvent());

    expect(received).toEqual([]);
  });

  it('turns a missing message into null', () => {
    const received: GiftAlert[] = [];
    service.streamFor('creator-1').subscribe((a) => received.push(a));

    service.handleContributionReceived(makeEvent({ message: undefined }));

    expect(received[0].message).toBeNull();
  });

  it('stops delivering after the creator disconnects', () => {
    const received: GiftAlert[] = [];
    const sub = service
      .streamFor('creator-1')
      .subscribe((a) => received.push(a));

    sub.unsubscribe();
    service.handleContributionReceived(makeEvent());

    expect(received).toEqual([]);
  });
});
