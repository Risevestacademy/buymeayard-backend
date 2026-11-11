import { fetchYoutubeChannel } from './youtube-channel';

const reply = (ok: boolean, status: number, body: unknown) =>
  jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;

describe('fetchYoutubeChannel', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('returns the first channel', async () => {
    const fetcher = reply(true, 200, {
      items: [{ id: 'UC1', snippet: { title: 'Ada' } }],
    });
    await expect(fetchYoutubeChannel('tok', fetcher)).resolves.toEqual({
      id: 'UC1',
      name: 'Ada',
    });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('mine=true'), {
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('returns null and says why when the account has no channel', async () => {
    const fetcher = reply(true, 200, { items: [] });
    await expect(fetchYoutubeChannel('tok', fetcher)).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no YouTube channel'),
    );
  });

  it('returns null and points at the API setting on a 403', async () => {
    const fetcher = reply(false, 403, { error: { message: 'not enabled' } });
    await expect(fetchYoutubeChannel('tok', fetcher)).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('enable YouTube Data API v3'),
    );
  });
});
