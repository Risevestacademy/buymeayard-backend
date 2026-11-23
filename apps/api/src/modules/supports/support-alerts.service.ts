import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject, filter, map } from 'rxjs';
import {
  CONTRIBUTION_EVENTS,
  ContributionNotificationEvent,
} from '../notifications/events/notification.events';

/** What the creator's browser receives. No email, no user id. */
export interface GiftAlert {
  supportId: string;
  supporterName: string;
  materialName: string;
  yards: number;
  /** The creator's cut after the fee. Kobo inside the API; the class-level
   * NairaResponseInterceptor on CreatorsController converts it to naira
   * before it reaches the browser.
   */
  netAmount: number;
  message: string | null;
}

@Injectable()
export class SupportAlertsService {
  private readonly events$ = new Subject<ContributionNotificationEvent>();

  @OnEvent(CONTRIBUTION_EVENTS.RECEIVED)
  handleContributionReceived(event: ContributionNotificationEvent): void {
    this.events$.next(event);
  }

  /** One independent stream per call, so each open tab gets its own. */
  streamFor(creatorUserId: string): Observable<GiftAlert> {
    return this.events$.pipe(
      filter((event) => event.creatorUserId === creatorUserId),
      map((event) => ({
        supportId: event.supportId,
        supporterName: event.supporterName,
        materialName: event.materialName,
        yards: event.yards,
        netAmount: event.amount,
        message: event.message ?? null,
      })),
    );
  }
}
