# Wormhole v45

## Twitch login repair

- Added a short-lived SameSite cookie fallback for the OAuth state verifier when Firefox privacy settings or another browser restriction blocks Web Storage.
- Extended the verifier window from 10 to 30 minutes so Twitch login and two-factor authentication do not expire mid-flow.
- Forces a fresh Twitch consent screen so newly requested permissions are not skipped by a cached authorization.
- Missing-scope errors now identify the exact Twitch permissions that were not granted.
- Added an optional fixed `redirectUriOverride` for hosts that expose production, preview, or rewritten URLs.
- Expanded login setup guidance for exact Twitch redirect matching, including the trailing slash and Netlify preview-host differences.
- The Twitch access token is still removed from the callback URL immediately and retained only for the browser session.
