import { IpThrottlerGuard } from './ip-throttler.guard';

describe('IpThrottlerGuard tracker', () => {
  const tracker = (req: object) =>
    (IpThrottlerGuard.prototype as any).getTracker(req);

  it('uses the last X-Forwarded-For entry', async () => {
    await expect(
      tracker({
        headers: { 'x-forwarded-for': '6.6.6.6, 102.89.1.1' },
        ip: '10.0.0.1',
      }),
    ).resolves.toBe('102.89.1.1');
  });

  it('falls back to req.ip', async () => {
    await expect(tracker({ headers: {}, ip: '10.0.0.1' })).resolves.toBe(
      '10.0.0.1',
    );
  });
});
