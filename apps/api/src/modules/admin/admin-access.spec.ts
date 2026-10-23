import { UserRole } from '@buymeayard/types';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { AdminController } from './admin.controller';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminCreatorsController } from './creators/admin-creators.controller';
import { AdminSupportsController } from './supports/admin-supports.controller';
import { AdminPayoutsController } from './payouts/admin-payouts.controller';
import { AdminLedgerController } from './ledger/admin-ledger.controller';
import { AdminReportsController } from './moderation/admin-reports.controller';
import { AdminTicketsController } from './tickets/admin-tickets.controller';
import { AdminSettingsController } from './settings/admin-settings.controller';
import { AdminAuditController } from './audit/admin-audit.controller';

describe('admin controllers', () => {
  it.each([
    AdminController,
    AdminUsersController,
    AdminCreatorsController,
    AdminSupportsController,
    AdminPayoutsController,
    AdminLedgerController,
    AdminReportsController,
    AdminTicketsController,
    AdminSettingsController,
    AdminAuditController,
  ])('%p is restricted to admins', (controller) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata('__guards__', controller)).toBeDefined();
    expect(Reflect.getMetadata('path', controller)).toMatch(/^admin/);
  });
});
