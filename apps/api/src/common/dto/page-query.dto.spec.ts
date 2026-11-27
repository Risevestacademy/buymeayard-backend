import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminListQueryDto } from '../../modules/admin/dto/admin-query.dto';
import { DashboardContributionsQueryDto } from '../../modules/creators/dto/creator-dashboard.dto';
import { DiscoverCreatorsQueryDto } from '../../modules/creators/dto/discover-creators-query.dto';
import { KycQueueQueryDto } from '../../modules/kyc/dto/admin-kyc.dto';
import { QueryNotificationsDto } from '../../modules/notifications/dto/query-notifications.dto';
import { ListPayoutsQueryDto } from '../../modules/payouts/dto/payout.dto';
import { SupportWallQueryDto } from '../../modules/supports/dto/support-wall.dto';
import { GetWaitlistQueryDto } from '../../modules/waitlist/dto/get-waitlist-query.dto';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PageQueryDto,
} from './page-query.dto';

const PAGE_BASED = [
  AdminListQueryDto,
  DashboardContributionsQueryDto,
  DiscoverCreatorsQueryDto,
  KycQueueQueryDto,
  QueryNotificationsDto,
  ListPayoutsQueryDto,
  GetWaitlistQueryDto,
];

describe('list query DTOs share one page/limit rule', () => {
  it.each(PAGE_BASED.map((dto) => [dto.name, dto] as const))(
    '%s defaults to page 1 and the shared limit',
    (_name, dto) => {
      const q = plainToInstance(dto as new () => PageQueryDto, {});
      expect(q.page).toBe(1);
      expect(q.limit).toBe(DEFAULT_PAGE_LIMIT);
    },
  );

  it.each(
    [...PAGE_BASED, SupportWallQueryDto].map((dto) => [dto.name, dto] as const),
  )('%s accepts the max limit and rejects above it', (_name, dto) => {
    const ok = plainToInstance(dto as never, { limit: `${MAX_PAGE_LIMIT}` });
    const tooMany = plainToInstance(dto as never, {
      limit: `${MAX_PAGE_LIMIT + 1}`,
    });
    expect(validateSync(ok as object)).toHaveLength(0);
    expect(validateSync(tooMany as object)).not.toHaveLength(0);
  });

  it('the wall pages by cursor, not page number', () => {
    const q = plainToInstance(SupportWallQueryDto, { cursor: 'abc' });
    expect(q.cursor).toBe('abc');
    expect(q.limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(q).not.toHaveProperty('page');
  });
});
