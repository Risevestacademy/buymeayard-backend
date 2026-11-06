# Creator social links

Platforms: `youtube`, `twitch`, `x`, `facebook`, `instagram`, `tiktok`, `discord`.
A creator has at most one link per platform. Each link is either **typed in**
(`verified: false`) or **connected** through the platform's OAuth (`verified: true`).

## Endpoints (creator session, cookie or Bearer)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/creators/me/social-links` | List links |
| PUT | `/api/v1/creators/me/social-links` | Replace the set: `{ "links": [{ "platform", "url" }] }` |
| DELETE | `/api/v1/creators/me/social-links/:platform` | Remove one |

`url` may be a handle (`@ada`) or a profile URL. Connected links sent back unchanged
in a PUT stay `verified`; anything else becomes `verified: false`.

## Connecting a real account

The creator must already be signed in. The frontend starts the flow, then the
provider redirects back to `callbackURL`. On success the backend stores the profile
URL as a verified link. Nothing else changes (no sign-in, no new user).

Start the flow for any platform with `POST /api/v1/auth/link-social`
`{ "provider": "<id>", "callbackURL": "<frontend url>" }`, where `<id>` is one of
`youtube`, `twitch`, `twitter` (for X), `facebook`, `instagram`, `tiktok`, `discord`.

It returns `{ "url": "<provider consent page>", "redirect": true }`. Send the user there.
After the redirect, call `GET /creators/me/social-links` to show the new link.
Disconnecting: `DELETE /creators/me/social-links/:platform` removes the link
(the OAuth account itself stays linked to the user).

## Provider setup

Redirect URI to register at each provider: `<API_URL>/api/v1/auth/callback/<provider id>`.

| Platform | Console | Env vars | Notes |
|---|---|---|---|
| X | developer.x.com, OAuth 2.0 app | `TWITTER_CLIENT_ID/SECRET` | Scopes `users.read tweet.read` |
| Facebook | developers.facebook.com | `FACEBOOK_CLIENT_ID/SECRET` | Profile URL needs the `user_link` permission (app review). Without it no link is stored |
| Instagram | Meta app, Instagram API with Instagram Login | `INSTAGRAM_CLIENT_ID/SECRET` | Business and creator accounts only. Scope `instagram_business_basic` |
| TikTok | developers.tiktok.com | `TIKTOK_CLIENT_KEY/SECRET` | Login Kit; scope `user.info.profile`. Needs app approval for production |
| Twitch | dev.twitch.tv/console | `TWITCH_CLIENT_ID/SECRET` | |
| Discord | discord.com/developers | `DISCORD_CLIENT_ID/SECRET` | Stores `https://discord.com/users/<id>` |
| YouTube | Google Cloud, enable YouTube Data API v3 | `GOOGLE_CLIENT_ID/SECRET` | Reuses the Google client. Add the redirect URI and the `youtube.readonly` scope to the consent screen |

A platform with blank credentials simply fails at the consent step. Hide its button
until its env vars are set.

## Deploy

1. Merge, then `pnpm prisma migrate deploy` (adds `verified`, one-per-platform index).
2. Set the env vars above on the API service.
3. Register the redirect URIs at each provider.
