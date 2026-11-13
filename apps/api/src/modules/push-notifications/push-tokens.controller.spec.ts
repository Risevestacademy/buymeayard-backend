import { PushTokensController } from './push-tokens.controller';

describe('PushTokensController', () => {
  const tokens = {
    register: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new PushTokensController(tokens as never);

  it('registers for the authenticated user and returns success', async () => {
    const dto = { token: 'ExponentPushToken[a]', platform: 'android' as const };
    await expect(controller.register('u1', dto)).resolves.toEqual({
      success: true,
    });
    expect(tokens.register).toHaveBeenCalledWith('u1', dto);
  });

  it('removes the token for the authenticated user', async () => {
    await controller.remove('u1', 'ExponentPushToken[a]');
    expect(tokens.remove).toHaveBeenCalledWith('u1', 'ExponentPushToken[a]');
  });
});
