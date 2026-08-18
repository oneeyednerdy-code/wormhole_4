# Wormhole v44

## Discovery and matching

- Added Similar Community, Growth Opportunity, Familiar Channels, and Explore Something New matching goals.
- Improved tag similarity with a balanced overlap calculation so one small tag set cannot dominate a recommendation.
- Preserved a separate primary-category bonus when multiple categories or genre games are selected.
- Added explicit Save current filters and Load saved filters controls.
- Cheap viewer and tag filters now run before profile, follow, and team enrichment to reduce Twitch API use.
- Search requests are canceled when a newer search replaces them.

## Historical estimates

- Viewer samples are grouped by distinct stream sessions instead of treating every observation equally.
- Recent sessions receive more weight, and high/low outlier sessions are trimmed when enough history exists.
- Result cards now label estimates as New, Low confidence, Moderate confidence, or Established history.

## Results workflow

- Added a shortlist for up to three live channels and a side-by-side comparison dialog.
- Added per-result Refresh and Hide actions.
- Added result freshness and filtered-candidate counts to the toolbar.
- Added a manual Automatic, Mobile, Tablet, or Desktop layout selector; the choice is remembered locally.

## Reliability

- Added a centralized request manager with timeouts, bounded GET retries, Twitch rate-limit tracking, and abort support.
- Mutation requests such as raid start, cancel, and chat send are never automatically retried.
- The raid destination is checked again immediately before the raid starts.
- Added visible EventSub connection status and disabled completion-message opt-in while confirmation is unavailable.
- EventSub reconnects with bounded backoff, follows Twitch reconnect instructions, watches keepalives, and ignores duplicate messages.
- OAuth state now expires after ten minutes.

## Optional Netlify security

- Added a same-origin serverless gate for raid start, raid cancel, and completion-message delivery.
- The gate validates the Twitch token and Client ID, verifies broadcaster/sender identity, restricts accepted actions and fields, and rejects mismatched origins.
- Added Netlify security headers and asset caching rules.
- Protected backend actions remain opt-in so the same package still works on any static host.

## Validation

- 105 automated tests pass, including request reliability, OAuth expiry, protected-action rejection, layout overrides, historical confidence, matching, Twitch API behavior, raids, storage, and interface contracts.
