# Wormhole (web)

Current release: **Beta-0.0.73**. During beta development, each feature build
increments the patch number (`Beta-0.0.71`, `Beta-0.0.72`, and so on).

The responsive layout automatically switches to a compact phone interface at
600 CSS pixels or below. Narrow phones use a single-column layout, a compact
account menu, non-obstructing result controls, 48-pixel touch targets, and
viewport-safe dialogs. A manual layout override remains available in the footer.

Wormhole checks `version.json` with `cache: no-store` on every page load. If a
browser serves an older page, the app removes obsolete Wormhole-managed Cache
Storage entries and reloads once with the current release in the URL. This
does not clear Twitch login state, accessibility settings, theme, privacy
choices, filter presets, or optional local history.

The product name used in browser tabs and bookmarks is **Wormhole Networking
Tool by OneEyedNerdy**. Its hourglass-wormhole mark uses a single Wormhole
purple (`#8B5CF6`) and is supplied as both SVG artwork and a multi-size ICO.

Result-card tags explain why they matched without relying on color alone. A
checkmark identifies a tag shared with the logged-in stream, a pound sign
identifies a manually searched tag, and both symbols identify a tag satisfying
both conditions. Matching tags are ordered before neutral channel tags.

A static website — plain HTML/CSS/JS, no build step, no framework — that
logs in with Twitch and finds you a good channel to raid, matched on:

- **Game / category** — search and add extra games/categories, not just your
  current one
- **Genre groups** — add curated gaming presets plus Creative, Coding & Tech,
  and Conversation groups for non-gaming Twitch categories
- **Viewer count** — choose channels within ±50%, ±75%, or ±100% of your
  current live viewers, or show every viewer count; ±50% remains the default
- **Channel status** — additive Partner/Affiliate toggles on top of an
  always-included non-affiliate pool
- **Chat access** — display current chat modes and, by default, exclude channels
  using followers-only, subscribers-only, or emote-only chat
- **Team** — optionally only show channels sharing one of your Twitch Teams
- **Tags** — optionally require candidates to have at least one of the tags
  you type; Following Only refreshes while typing and normalizes common
  spacing/punctuation differences
- **Language** — defaults to English and offers popular language choices;
  it is applied independently from custom tags, while **Any language** removes
  the language restriction without deleting your other tag choices
- **Suggested tags** — one-click shortcuts add or remove common Twitch tags,
  including GenAIOptedOut, AIOptedOut, MatureContent, 18Plus, LurkerFriendly,
  LGBTQIAPlus, Chatty, AMA, Cozy, FirstPlaythrough, NoBackseating, and VTuber
- **Content warnings** — independently set each Twitch content classification
  label or the mature-audience stream setting to Any, Require, or Exclude.
  Multiple required labels use an at-least-one match, while matching any
  excluded label removes the channel. If Twitch cannot return classification
  data during a filtered search, Wormhole omits that uncertain result.
- **Automatic tag matching** — compares the logged-in stream's Twitch tags
  with every candidate, shows shared tags on result cards, and uses meaningful
  overlap in the recommendation score; language tags are shown but scored
  separately so a shared language cannot overpower community/content matches
- **Average viewership** — see note below on how this is estimated
- **Stream duration** — how long the candidate has been live, vs. you

Results render as a grid of cards, each with a click-to-play live preview
(Twitch's own embedded player) alongside the stats. Results are paginated with
a selector for 12 through 100 cards per page. They can be sorted by recommended
match, followed channels first, tag match, viewers high-to-low or low-to-high, longest
live (the best available "ending soon" proxy), or most recently started. It
can also **start the raid** for you directly, via the Twitch API. After a raid
starts, Wormhole displays Twitch's 90-second countdown with a cancel option.
When the countdown finishes, Wormhole waits for Twitch's actual `channel.raid`
EventSub confirmation. The confirmation opens an in-app destination view with
the official Twitch player and chat embeds. Wormhole no longer posts an
automatic completion message; optional raid text is editable and copy-only.

Version 44 adds four matching goals (Similar Community, Growth Opportunity,
Familiar Channels, and Explore Something New), explicit save/load controls for
one local filter preset, and a three-channel shortlist comparison. Individual
results can be refreshed or hidden without rerunning the entire search. The
toolbar reports when data was fetched and how many candidates were removed by
the active filters. Historical audience estimates now group samples by stream,
trim outliers when enough sessions exist, weight recent streams more heavily,
and display a confidence label.

The interface uses a responsive raid-control-room layout with collapsible
discovery controls, removable active-filter chips, a sticky results toolbar,
accessible focus states and higher-contrast system support. Match cards explain
why each channel was recommended and keep deeper VOD, clip, schedule, account,
and local-history information inside an expandable details area. Searches use
skeleton cards and provide retry guidance when Twitch cannot return results.
The filter-collapse, persistent light/dark theme, and explicit high-contrast controls run in a small,
independent UI module so they remain available even if Twitch authentication or
another API feature fails to initialize. Responsive breakpoints cover desktop,
tablet, and narrow mobile layouts, and a bundled SVG Wormhole mark appears in
both the login panel and application header. The mark depicts two glowing
portal mouths connected by the narrow throat of an hourglass-shaped wormhole.

Phones and tablets automatically receive a dedicated touch layout without a
redirect or second login. It detects narrow viewports and coarse touch input,
then uses larger 44-pixel controls, single-column cards, compact navigation,
bottom-sheet dialogs, safe-area spacing, a sticky raid-search action, and a
tablet two-column result grid. Rotating or resizing the device updates the
layout automatically, while desktop screens retain the full dashboard. A
footer selector can force Mobile, Tablet, or Desktop layout and remembers that
preference on the device.

If you are offline, Wormhole offers up to five recent past-broadcast VODs to
choose from. Twitch supplies each VOD's title, date, duration, and thumbnail.
The broadcaster status panel displays Twitch's official player after login:
your channel while live, or the currently selected VOD while offline. Playback
starts paused and muted. Because Twitch requires embedded players to be at
least 400 pixels wide, phone panels that cannot meet that minimum receive an
**Open on Twitch** fallback.
When Wormhole previously observed that live session, it restores that stream's
exact category and locally sampled viewer average. Otherwise it falls back to
the channel's last-played category and broader local average, and lets you
correct the category or viewer baseline before searching. Twitch's VOD
`view_count` is deliberately not used because it counts total VOD plays, not
concurrent live viewers. Offline results are discovery only; selecting **Find
using selected stream** immediately runs the search, and you must be live
before Wormhole enables the raid action.

Twitch exposes only the channel's most recently played category, not the
category attached to every older VOD. Wormhole therefore clears the category
when an older VOD has no locally saved match, requires you to select the correct
category, and remembers that correction for the next time you choose that VOD.

Why plain HTML/JS instead of a framework: Twitch's OAuth flow is designed
around a browser redirect (`response_type=token`), which a static site
handles natively — no popups, no custom URL schemes, no build tooling.

---

## 1. Register a Twitch application

1. Go to https://dev.twitch.tv/console/apps → **Register Your Application**.
2. Name it anything (e.g. "Wormhole").
3. **OAuth Redirect URLs**: add the exact URL you'll serve this site from —
   for example:
   - `http://localhost:8000/` for local testing
   - `https://yourname.github.io/wormhole/` for GitHub Pages
   - `https://your-domain.example/` for another static host

   You can register multiple redirect URLs on the same app, so add both your
   local and production URLs.
4. Client type: **Confidential**. Twitch currently limits Public clients to
   Device Code Flow, so Public will not work with this browser redirect. The
   implicit flow still uses only the public Client ID: do **not** put the
   generated client secret in Wormhole or any frontend file.
5. Save, then copy the **Client ID**.

Open `js/twitch-config-v73.js` and paste it in:

```js
clientId: 'YOUR_TWITCH_CLIENT_ID',
```

The redirect URI itself doesn't need editing — it's computed automatically
from wherever the page is being served (`window.location.origin +
window.location.pathname`), as long as it matches something you registered
in step 3.

Wormhole normalizes `/index.html` to its containing directory so the callback
is stable. Expand **Login setup help** on the login screen and copy the exact
URL shown there into Twitch's OAuth Redirect URLs. Twitch requires an exact
match, including HTTPS, hostname, path, and trailing slash.

If your host exposes the app through several aliases or rewrites, set
`redirectUriOverride` in `js/twitch-config-v73.js` to the one production callback you
registered with Twitch. Production and preview hostnames are different origins
and must not be treated as interchangeable.

Login requests force a fresh Twitch approval screen so newly added permissions
cannot be skipped by an older authorization. The CSRF verifier is retained for
up to 30 minutes in session storage, local storage, and a short-lived SameSite
cookie fallback; the access token itself remains in session storage only.

The login screen and authenticated header both expose display controls. The
Accessibility settings dialog provides persistent 100%, 125%, 150%, and 200%
text sizes, relaxed spacing, reduced motion, underlined links, and simplified
match cards. These preferences are essential local accessibility settings and
do not enable optional stream history.

---

## 2. Run it locally

Because this uses ES modules (`<script type="module">`), it needs to be
served over `http://`, not opened directly as a `file://` path (browsers
block module imports from the filesystem). Any static server works:

```bash
cd wormhole
python3 -m http.server 8000
# then open http://localhost:8000/
```

or `npx serve .`, or the VS Code "Live Server" extension — anything that
serves static files.

---

## 3. Deploy it

Any static host works, since there's no server-side code:

- **GitHub Pages**: push this folder to a repo, enable Pages on it.
- **Vercel or another static host**: upload the folder or connect the repo.
- **Any web host**: it's just static files — upload as-is.

Whatever URL it ends up live at, make sure that exact URL is registered as
an OAuth Redirect URL on your Twitch app (step 1).

## Reliability and safety

- GET requests have a 15-second timeout, bounded retry behavior for transient
  Twitch failures, rate-limit header tracking, and cancellation when a newer
  search replaces an older one.
- Raid and chat mutations are never retried automatically.
- The selected destination is checked again immediately before raid start.
- The EventSub connection exposes its current state. Completion-message opt-in
  is unavailable unless confirmation is connected; Twitch reconnect
  instructions are honored and duplicate messages are ignored.
- OAuth state expires after thirty minutes to allow time for Twitch login and
  two-factor authentication while still narrowing the callback replay window.
- A successful Twitch login no longer depends on every optional startup call.
  Live status, teams, channel details, VODs, and EventSub degrade separately.
  If Twitch validates the token but briefly fails to return the full `/users`
  profile, Wormhole can open with the validated user ID and login while clearly
  marking the reduced startup state.
- Core profile or live-status failures now pause EventSub instead of leaving
  raid confirmation in a connecting loop. The dashboard displays the Twitch
  API status, safe technical details, and dedicated Retry data and Authorize
  again actions. Offline channels use a non-animated Confirmation standby
  state because they cannot start a raid.

---

> **Note:** "Helix" is the name Twitch itself gives its public API (it's
> baked into the real endpoint, `api.twitch.tv/helix`) — it isn't part of
> this app's branding and can't be renamed without breaking every request.
> Everywhere else in this project, "Wormhole" is the product name.

## How matching works

- An exact streamer lookup accepts a Twitch username, `@mention`, or channel
  URL. If that channel is live, it appears in the standard match card with
  discovery filters bypassed; offline and missing channels are reported
  directly.
- Pulls your current live stream (game, viewer count, start time) via the
  Twitch Helix API.
- When offline, offers up to five recent VODs and combines them with locally
  captured stream-specific category/viewer data or editable fallbacks. The
  category can be explicitly cleared to search across Twitch using tags and
  the remaining audience/community filters instead.
- Paginates through live streams for each selected category until it reaches
  channels below your selected ±50%, ±75%, or ±100% range (up to 1,000
  candidates per category). When **All** is selected, it retrieves up to 500
  per category.
- With automatic tag matching available, scores each by viewer-count closeness
  (40%), estimated-average-viewers closeness (25%), stream-duration closeness
  (20%), and meaningful Twitch-tag similarity (15%). If tag comparison is
  disabled or the reference stream has only language tags, the original
  viewer-count (50%), estimated-average (30%), and duration (20%) weights apply.
  See `js/raid-match.js` to tune these weights.
- Every match card shows the channel's Twitch tags. Tags shared with the
  selected live or previous stream are marked with a check and highlighted.
- By default, only channels from 50% to 150% of your current live viewer count
  qualify. The wider options expand that band to 25%–175% or 0%–200%.
  **All** removes the hard limit while retaining viewer similarity in ranking.
- The **Filters** panel adds several hard filters (candidates outside these
  are excluded entirely, not just scored lower):
  - **Viewer count** — automatically shows the selected ±50%, ±75%, or ±100%
    range calculated from your audience, with an **All** option. The active
    range also appears as a removable filter chip.
  - **Channel status** — Partner and Affiliate are *additive* toggles on
    top of an always-included non-affiliate pool (most of Twitch). There's
    no separate "non-affiliate" checkbox — unchecking both Partner and
    Affiliate just stops adding those tiers on top, it never hides anyone.
    Since Twitch's `/streams` endpoint doesn't include broadcaster status
    at all, the app makes one extra batched call to `/users` per search to
    look it up.
  - **Following only** — ignores the logged-in stream's game plus all selected
    game and genre categories, then paginates through every followed channel
    currently live. Typed tags, status, and team filters still apply. When the
    logged-in channel is offline and no previous-stream baseline is selected,
    Following Only remains available; category and viewer-range matching are
    skipped while typed tags and the remaining usable filters continue to work.
  - **Exclude restricted chat** — enabled by default; checks current public
    chat settings and removes channels using followers-only, subscribers-only,
    or emote-only chat. Cards also
    show followers-only duration, subscribers-only, emote-only, slow, unique,
    open, or unavailable chat status. Twitch exposes one channel per request,
    so Wormhole caches these lookups and runs them with limited concurrency.
  - **Team** — only show channels sharing one of your Twitch Teams. (Twitch
    doesn't have "guilds" — Teams are the closest equivalent: a named group
    of channels shown on each member's About page.) Twitch has no batch
    endpoint for team membership, so this makes one request per candidate
    channel — to keep that reasonable, it only runs *after* the viewer-count
    and channel-status filters have already narrowed the list, and fires
    those requests with limited concurrency. If you're not on a team, this
    filter is disabled with an explanatory note.
  - **Tags** — type any number of comma-separated tags (Twitch's free-text
    stream tags, e.g. "Speedrun", "Cozy", "English"); a candidate matches if
    it has *at least one* of the tags you typed, case-insensitively.
  - **Match my stream tags** — enabled by default; compares the logged-in
    stream's current tags to each candidate as a recommendation signal rather
    than excluding channels. Shared tags appear on each card. Previously
    observed tags are saved with stream history for offline matching.
  - **Categories** — search box to add other games/categories to the search,
    beyond your own current one. See the IGDB note below for why this uses
    Twitch instead of calling IGDB directly. The dropdown combines Twitch's
    exact-name Games lookup with up to 20 fuzzy category matches, ensuring an
    exact valid category is not hidden outside a short suggestion list.
  - **Genre groups** — broad presets based on IGDB's genre, theme, and game-mode
    concepts. Checkbox changes apply automatically. Wormhole resolves curated
    game names through small Twitch `/games` batches and falls back to Twitch's
    category search for naming variations. It visually marks added categories
    and lets you remove any game individually. Genre IDs are sent together in a
    batched `/streams` request, so mapped games do not become separate searches.
- Each result card marks channels you already follow with a **Following**
  badge and, when available, the month and year you followed them. This uses
  Twitch's `/channels/followed` endpoint and the `user:read:follows` scope; it
  only filters discovery results when **Following only** is enabled. If you
  logged in before that permission was added, log out and back in once.
- Each visible result also shows whether that channel follows your channel.
  **Mutual follow** means you follow each other; **Follows you** means they
  follow you even though you do not currently follow them. This uses Twitch's
  `/channels/followers` endpoint and read-only `moderator:read:followers`
  scope. Checks are limited to the visible page and cached for the session.
  Existing users must approve the added permission once.
- The separate **Live channels you follow** button loads Twitch's complete
  paginated list of followed channels currently live. It bypasses games,
  categories, viewer ranges, tags, teams, and every other discovery filter.
  It works while the logged-in channel is offline, although raid actions stay
  disabled until that channel goes live.
- The results toolbar can sort the current matches without rerunning the Twitch
  search. **Following First** groups channels you already follow at the top and
  keeps them ordered by recommendation score. **Ending Soon** places the
  longest-currently-live channels first;
  Twitch does not publish a reliable end time for every live channel, so this
  is a clearly labelled proxy rather than a promise that the stream will end.
- Each visible result card loads the channel's public follower total from
  Twitch's `/channels/followers` endpoint. Totals are cached while the app is
  open, and only the current results page is loaded to limit API requests.
- Result cards load Twitch Content Classification Labels from channel
  information and show them as accessible content warnings, including
  politics and sensitive social issues, drugs or intoxication, gambling,
  mature-rated games, profanity, sexual themes, and graphic violence.
- Following First is the default results order. Channels the logged-in user
  already follows appear above unfollowed channels, while the other sort modes
  remain available when a different ordering is needed.
- Unfollowed result cards include a Follow on Twitch action. Twitch does not
  provide an API operation for third-party apps to create a follow, so the
  action securely opens that channel on Twitch for the user to confirm.
- Twitch restricts ad-schedule data to the broadcaster who owns the target
  channel. Wormhole therefore does not claim to verify a destination's ad
  status and explains this limitation in the raid confirmation dialog.
- The raid confirmation dialog and active 90-second countdown both embed the
  target channel. The streamer can play the preview and wait for live content
  before using Twitch's Raid Now control. Because Twitch ads may be
  viewer-specific, the preview is a manual safety check rather than a guarantee.
- **Recent activity** loads on demand for one result at a time and includes:
  the latest three public VODs, total broadcasts found in the last 30 days,
  popular clips with in-card previews, account creation date, and the next
  published schedule segment. It also estimates when the current live stream
  may end by adding the median duration of recent VODs to its actual start time,
  while showing Twitch's scheduled end separately when a current schedule
  segment exists. Both are clearly labelled as estimates/plans. VOD views are
  replay views, not historical concurrent viewers.
- Wormhole stores a small local snapshot when a result is viewed. Returning to
  the same channel later can show observed category history and follower-count
  change. Twitch does not provide those time series, so this history begins on
  the device and browser where Wormhole is used and is capped to 300 channels.
- Each result card shows a click-to-play live preview using Twitch's own
  embedded player (`player.twitch.tv`). A dedicated **Preview stream** button
  appears beside the raid button, so you can actually watch a few
  seconds of the stream before deciding to raid — plus an "Open on Twitch ↗"
  link as a fallback if the embed doesn't load (ad blockers sometimes catch
  it). The embed only needs a `parent` URL parameter matching whatever
  domain is serving the page — no extra Twitch app registration required
  beyond the OAuth redirect URL you already set up.

### A note on IGDB

Twitch owns IGDB and Twitch's category IDs are sourced from IGDB's game
database — but IGDB's *own* API can't be called from a browser-only app
like this one: it has no CORS support (confirmed by developers hitting
exactly this wall — see
[twitchtv/igdb-api-node#39](https://github.com/twitchtv/igdb-api-node/issues/39)),
and its OAuth requires a client secret, which can never safely live in
front-end JavaScript with no backend to hide it behind.

What this app uses instead is Twitch's own `Search Categories` endpoint
(`/helix/search/categories`), which queries that same underlying database,
is fully CORS-enabled, and works with the same user token the rest of the
app already has. That's what powers the "Categories" filter — search for
another game or category by name and add it to your search, rather than an
automatic "similar games" suggestion (which would need IGDB's genre/
similar-games fields specifically).

The broad genre filter uses a browser-safe curated mapping in
`js/genre-presets.js`. RPG/Shooter/Strategy/Adventure correspond primarily to
IGDB genres; MMO corresponds to a game mode; Horror and Survival are treated as
themes. This avoids shipping an IGDB client secret in public JavaScript. The
mapping can be updated as games become more or less relevant on Twitch.

If you do want true IGDB genre-based matching, it's possible — but it needs
a small backend (even a single serverless function) to hold the client
secret and proxy the request with the right CORS headers. That's outside
the scope of this no-backend static site, but straightforward to bolt on
if you're willing to add one function on Cloudflare Workers, Vercel, or
similar.

### A note on "average viewership"

Twitch's public API only exposes a channel's **current, live** viewer count
— it doesn't expose historical averages (that lives behind third-party
analytics sites, not the official API). To approximate a real average
instead of a single snapshot, this app keeps a small local history of
viewer-count samples for every channel it's seen when you choose **Allow local
history** in the first-visit storage panel. Those samples stay in your browser's
`localStorage`, and the app averages them once it has at least a few. Samples
are recorded no more than once every five minutes per channel, so repeated
filter changes do not distort the estimate.
Until a channel's been seen a few times, its "average" falls back to its
current live viewer count, and result cards mark that with **"(est.)"**.
The more you use the app, the better these estimates get. This history is
local to your browser — it isn't sent anywhere.

### Privacy and storage choices

On first visit, Wormhole offers two clear choices: **Essential only** or
**Allow local history**. Essential storage covers the Twitch login flow, the
saved storage choice, and explicitly selected accessibility preferences.
Optional history covers viewer samples, channel/category snapshots, up to five
previous-stream references, and up to 150 privacy-sanitized diagnostic events.
Until permission is given, those optional records are neither read nor written.
Diagnostics can remain in memory for the current session and download as a
plain-text log for the Wormhole Discord <strong>#bug-reports</strong> channel.

The footer's **Privacy settings** control reopens the panel at any time. It can
also delete all optional local history. `privacy.html` contains the concise
storage policy.

---

## Sending the actual raid

The **Raid this channel** button calls `POST /helix/raids`, which requires
your login to have granted the `channel:manage:raids` scope (already
requested at login). It asks for confirmation first, then Twitch shows the
usual raid countdown in your dashboard/chat. The local countdown never sends
a message by itself. Wormhole waits for the outgoing `channel.raid` EventSub
notification for the exact selected destination. Before accepting a raid, the
streamer can edit and copy an optional raid message for manual use in Twitch
chat. Wormhole does not request chat-write permission or automatically post a
raid-completed message. The confirmed destination view still loads Twitch's
official live player and chat without redirecting the browser away from the app.
During the pending countdown, **Open Twitch Raid Controls** opens the logged-in
streamer's official Twitch Stream Manager in a new tab. The streamer may use
Twitch's own **Raid Now** control there to complete immediately; Wormhole does
not attempt to imitate or bypass that protected Twitch action.

---

## Project structure

```
index.html          # Page shell, both views (login + app)
privacy.html        # Storage and privacy policy
assets/
  wormhole-logo.svg  # Single-color hourglass-wormhole mark
  favicon.ico        # 16, 32, and 48 px browser/bookmark icon
css/styles.css       # All styling
js/
  twitch-config-v73.js # Client ID, scopes, redirect URI
  twitch-auth.js      # OAuth redirect flow, CSRF state check, session token storage
  twitch-api.js       # Twitch API calls (users, streams, raids)
  direct-search.js    # Normalizes exact streamer usernames and URLs
  viewer-history.js   # Local rolling viewer-count history
  previous-stream-history.js # Last five locally observed stream sessions
  storage-consent.js  # Optional-history permission and deletion
  storage-consent-ui.js # First-visit panel and privacy controls
  appearance-boot.js   # Applies saved theme before first paint
  raid-listener.js    # Confirms completed outgoing raids through EventSub
  raid-match.js       # Filtering and scoring algorithm
  wormhole-app-v73.js # Wires everything together, renders the UI
tests/
  raid-match.test.mjs # Core matching behavior tests
  twitch-auth.test.mjs # Twitch login security and redirect tests
```

There are no runtime dependencies and no build step. `package.json` only
provides the local test command. The only external page resources are Google
Fonts (Space Grotesk, Inter, IBM Plex Mono).
