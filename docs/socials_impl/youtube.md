# YouTube

Follows the shared flow in [README.md](./README.md). Only the values below are
specific to YouTube.

| | |
|---|---|
| Provider id | `youtube` |
| Platform key in links | `youtube` |
| Scope requested | `youtube.readonly` |
| Stored URL | `https://youtube.com/@handle`, or `https://youtube.com/channel/<id>` when the channel has no handle |

## Start

```json
POST /api/v1/auth/link-social
{
  "provider": "youtube",
  "callbackURL": "https://creator.buymeayard.com/settings/socials?connected=youtube",
  "errorCallbackURL": "https://creator.buymeayard.com/settings/socials?failed=youtube"
}
```

Google always shows its **account picker** and consent screen. Tell the creator to
choose the account that owns their channel (a brand account's channel lives on the
account that manages it).

## Errors on `errorCallbackURL`

| `error` | Cause | Message to show |
|---|---|---|
| `unable_to_get_user_info` | The chosen Google account has no YouTube channel | "No YouTube channel found on that Google account. Pick the account that owns your channel." |
| `access_denied` | Cancelled, or the app is in Testing and the account is not a listed test user | "Connection cancelled" |

`unable_to_get_user_info` also appears if the YouTube Data API is not enabled for the
project (a backend setup issue, shown in the API log as a 403). If it happens for
every creator, tell the backend team.

## Result

```json
GET /api/v1/creators/me/social-links
[{ "platform": "youtube", "url": "https://youtube.com/@ada", "verified": true }]
```

## Before this works in an environment

- Backend: Google Cloud setup from `docs/SOCIAL_LINKS.md` (API enabled, redirect URI
  `<API_URL>/api/v1/auth/callback/youtube`, `GOOGLE_CLIENT_ID/SECRET` set).
- While Google's consent screen is in **Testing**, only listed test users can connect.
  Public launch needs Google's verification for the `youtube.readonly` scope.
