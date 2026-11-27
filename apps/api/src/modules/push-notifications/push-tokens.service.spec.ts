import { BadRequestException } from '@nestjs/common';
import { PushTokensService } from './push-tokens.service';

const TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

describe('PushTokensService', () => {
  let prisma: {
    pushToken: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let service: PushTokensService;

  beforeEach(() => {
    prisma = {
      pushToken: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn(),
      },
    };
    service = new PushTokensService(prisma as never);
  });

  it('upserts by token and reassigns it to the caller', async () => {
    await service.register('u2', { token: TOKEN, platform: 'ios' });
    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: { token: TOKEN },
      update: { userId: 'u2', platform: 'ios' },
      create: { token: TOKEN, userId: 'u2', platform: 'ios' },
    });
  });

  it('rejects a token that is not an Expo push token', async () => {
    await expect(
      service.register('u1', { token: 'abc', platform: 'android' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pushToken.upsert).not.toHaveBeenCalled();
  });

  it('only deletes the caller’s own token', async () => {
    await service.remove('u1', TOKEN);
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({
      where: { token: TOKEN, userId: 'u1' },
    });
  });

  it('removeInvalid skips the query for an empty list', async () => {
    await service.removeInvalid([]);
    expect(prisma.pushToken.deleteMany).not.toHaveBeenCalled();
  });
});
