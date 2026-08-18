# Wormhole v50

## Twitch data diagnostics and EventSub control

- Fixed raid confirmation repeatedly connecting when Twitch profile or live-stream data failed to load.
- EventSub confirmation now starts only when the authenticated channel is confirmed live and core Twitch data loaded successfully.
- Offline channels show Confirmation standby instead of opening an unnecessary EventSub connection.
- Failed core data requests now display their Twitch API status and safe technical details inside the dashboard.
- Added Retry Twitch data and Authorize again controls.
- The application no longer presents a limited profile as though Twitch data loaded normally.
