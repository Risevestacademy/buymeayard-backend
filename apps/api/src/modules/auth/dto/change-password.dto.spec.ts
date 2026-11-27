import { ValidationPipe } from '@nestjs/common';
import { ChangePasswordDto } from './change-password.dto';

// The shared barrel pulls in the ESM-only auth library; password strength is
// not what this spec is about
jest.mock('../../../common', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  IsValidPassword: () => require('class-validator').IsString(),
}));

describe('ChangePasswordDto', () => {
  // The same settings as the app's global pipe
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const transform = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: ChangePasswordDto });
  const base = {
    currentPassword: 'OldP@ssw0rd!',
    newPassword: 'NewP@ssw0rd1!',
  };

  it('accepts revokeOtherSessions', async () => {
    await expect(
      transform({ ...base, revokeOtherSessions: true }),
    ).resolves.toMatchObject({ revokeOtherSessions: true });
  });

  it('still works without it', async () => {
    await expect(transform(base)).resolves.toMatchObject(base);
  });

  it('rejects a value that is not a boolean', async () => {
    await expect(
      transform({ ...base, revokeOtherSessions: 'yes' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('still rejects unknown fields', async () => {
    await expect(transform({ ...base, nope: 1 })).rejects.toMatchObject({
      status: 400,
    });
  });
});
