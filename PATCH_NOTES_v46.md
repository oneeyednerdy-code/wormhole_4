# Wormhole v46

## Twitch post-login startup repair

- Fixed a startup bug where failure of the optional live-stream lookup was reported as “Could not load your Twitch profile” and blocked the entire application.
- Live status, Twitch Teams, channel information, recent VODs, and EventSub confirmation now fail independently instead of invalidating a successful login.
- When Twitch validates the user token but temporarily fails to return `/users`, Wormhole can open with the validated user ID and login as a limited profile.
- Added distinct messages for Twitch API 401, 403, and 429 responses instead of one generic profile error.
- Disabled caching for token validation and authenticated Twitch API reads to prevent stale authorization responses.
- Discovery remains available when optional startup data is unavailable; raid confirmation messaging remains disabled if EventSub cannot connect.
- Added automated coverage for the validated-identity fallback.
