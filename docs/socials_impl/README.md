# Connecting social accounts: frontend guide

One page per platform, added as each platform is implemented. Backend overview:
`docs/SOCIAL_LINKS.md`.

| Platform | Provider id | Status | Page |
|---|---|---|---|
| YouTube | `youtube` | Backend ready, needs Google setup | [youtube.md](./youtube.md) |
| X, Twitch, Discord, Instagram, Facebook, TikTok | | Not started | |

## The flow (same for every platform)

The creator must already be signed in (session cookie, or `Authorization: Bearer`).
Connecting never signs anyone in and never creates a user.

```
1. POST /api/v1/auth/link-social   -> { url, redirect: true }
2. window.location.href = url      (provider consent page)
3. provider -> API callback -> API stores the verified link
4. browser lands on callbackURL (success) or errorCallbackURL (failure)
5. GET /api/v1/creators/me/social-links -> refresh the UI
```

### 1. Start

```ts
const res = await fetch(`${API}/api/v1/auth/link-social`, {
  method: 'POST',
  credentials: 'include', // cookie session; omit and send Bearer on mobile
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    provider: 'youtube',
    callbackURL: `${location.origin}/settings/socials?connected=youtube`,
    errorCallbackURL: `${location.origin}/settings/socials?failed=youtube`,
  }),
});
const { url } = await res.json();
window.location.href = url;
```

Always send `errorCallbackURL`. Without it, errors land on the creator app's default
error page instead of the page the user came from. Both URLs must be on a trusted
origin (the creator, admin and main frontends, or `ADDITIONAL_TRUSTED_ORIGINS`).

### 4. Handle the return

On `errorCallbackURL` the query has `?error=<code>`. Codes seen so far:

| `error` | Meaning | Show |
|---|---|---|
| `unable_to_get_user_info` | Provider connected but gave no usable profile (platform pages list the cause) | Platform-specific message |
| `access_denied` | The user cancelled on the consent page | Nothing, or "Connection cancelled" |
| anything else | Unexpected | "Could not connect. Try again." |

### 5. Read the result

`GET /api/v1/creators/me/social-links` returns the links. A connected account has
`verified: true` and the real profile URL; typed links have `verified: false`.

## Rules for the UI

- Show a **Connect** button per platform, and a **Connected** badge when
  `verified: true`. Hide a platform's button until the backend has its credentials
  (a blank client id fails at the consent step).
- **Disconnect:** `DELETE /api/v1/creators/me/social-links/:platform`.
- Typed links (`PUT /creators/me/social-links`) are still allowed and stay unverified.
  Sending a connected link back unchanged keeps it verified; editing its URL makes it
  unverified.
- One link per platform. Connecting again replaces the old one.
- **Mobile:** open `url` in an in-app browser session and pass a deep link such as
  `buymeayard://socials?connected=youtube` as `callbackURL` and `errorCallbackURL`.
