/**
 * Looks up the YouTube channel of the Google account that just connected.
 * Returns null when there is nothing to connect. The reason is logged, because
 * Better Auth only reports `unable_to_get_user_info` to the frontend.
 */
export interface YoutubeChannel {
  id: string;
  name?: string;
}

export async function fetchYoutubeChannel(
  accessToken: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<YoutubeChannel | null> {
  const res = await fetcher(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${accessToken ?? ''}` } },
  );
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300);
    console.warn(
      `[Auth] YouTube channel lookup failed (${res.status}). If this is 403, enable YouTube Data API v3 in Google Cloud. ${body}`,
    );
    return null;
  }
  const body = (await res.json()) as {
    items?: { id: string; snippet?: { title?: string } }[];
  };
  const channel = body.items?.[0];
  if (!channel) {
    console.warn(
      '[Auth] YouTube connect: this Google account has no YouTube channel',
    );
    return null;
  }
  return { id: channel.id, name: channel.snippet?.title };
}
