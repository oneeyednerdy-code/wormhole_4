# Wormhole v52

## Follow-back visibility

- Added a follow-back status to every visible match card.
- Shows `Mutual follow` when you follow each other.
- Shows `Follows you` when the channel follows you but you do not follow it.
- Clearly distinguishes channels that do not follow you from unavailable Twitch data.
- Checks only the visible results with limited concurrency and caches responses to protect Twitch API limits.
- Added Twitch's read-only `moderator:read:followers` permission, so existing users must authorize Wormhole again once.
