import { ForbiddenException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersService.setStatus', () => {
  function setup(user: unknown) {
    const tx = {
      user: { update: jest.fn() },
      session: { deleteMany: jest.fn() },
      creatorProfile: { update: jest.fn() },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const audit = { record: jest.fn() };
    const service = new AdminUsersService(prisma as never, audit as never);
    jest.spyOn(service, 'get').mockResolvedValue({} as never);
    return { service, tx, audit };
  }

  const creatorUser = {
    id: 'u-1',
    status: 'ACTIVE',
    roles: [{ role: { name: 'CREATOR' } }],
    creatorProfile: { id: 'cr-1', kycStatus: 'VERIFIED', kycBlockedAt: null },
  };

  it('suspends the user, signs them out, unpublishes the creator page and audits it', async () => {
    const { service, tx, audit } = setup(creatorUser);

    await service.setStatus('u-1', 'admin-1', {
      status: 'SUSPENDED' as never,
      reason: 'Fraud',
    });

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { status: 'SUSPENDED' },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
    });
    expect(tx.creatorProfile.update).toHaveBeenCalledWith({
      where: { id: 'cr-1' },
      data: { status: 'SUSPENDED', isPublished: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.user.status_changed',
        previousState: { status: 'ACTIVE' },
        newState: { status: 'SUSPENDED' },
        metadata: { reason: 'Fraud' },
      }),
    );
  });

  it('reactivates a verified creator without re-publishing the page', async () => {
    const { service, tx } = setup({ ...creatorUser, status: 'SUSPENDED' });

    await service.setStatus('u-1', 'admin-1', {
      status: 'ACTIVE' as never,
      reason: 'Appeal accepted',
    });

    expect(tx.session.deleteMany).not.toHaveBeenCalled();
    expect(tx.creatorProfile.update).toHaveBeenCalledWith({
      where: { id: 'cr-1' },
      data: { status: 'ACTIVE' },
    });
  });

  it('does not let an admin change their own account or another admin', async () => {
    const own = setup(creatorUser);
    await expect(
      own.service.setStatus('admin-1', 'admin-1', {
        status: 'BANNED' as never,
        reason: 'x',
      }),
    ).rejects.toThrow(ForbiddenException);

    const other = setup({
      ...creatorUser,
      roles: [{ role: { name: 'ADMIN' } }],
    });
    await expect(
      other.service.setStatus('u-1', 'admin-1', {
        status: 'BANNED' as never,
        reason: 'x',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(other.tx.user.update).not.toHaveBeenCalled();
  });
});
