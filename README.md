# Wormhole (web)

A static website — plain HTML/CSS/JS, no build step, no framework — that
logs in with Twitch and finds you a good channel to raid, matched on:

- **Game / category** — search and add extra games/categories, not just your
  current one
- **Genre groups** — add curated RPG, MMO, Shooter, Strategy, Horror,
  Survival, Simulation, or Adventure game groups, then remove individual
  categories you do not want
- **Viewer count** — choose channels within ±50%, ±75%, or ±100% of your
  current live viewers, or show every viewer count; ±50% remains the default
- **Channel status** — additive Partner/Affiliate toggles on top of an
  always-included non-affiliate pool
- **Team** — optionally only show channels sharing one of your Twitch Teams
- **Tags** — optionally require candidates to have at least one of the tags
  you type in (e.g. "speedrun", "cozy", "english")
- **Language** — defaults to English and offers popular language choices;
  selecting one adds it to the existing Twitch-tags filter, while **Any
  language** removes language tags without deleting your other tag choices
- **Automatic tag matching** — compares the logged-in stream's Twitch tags
  with every candidate, shows shared tags on result cards, and uses meaningful
  overlap in the recommendation score; language tags are shown but scored
  separately so a shared language cannot overpower community/content matches
- **Average viewership** — see note below on how this is estimated
- **Stream duration** — how long the candidate has been live, vs. you

Results render as a grid of cards, each with a click-to-play live preview
(Twitch's own embedded player) alongside the stats. Results are paginated with
a selector for 12 through 100 cards per page. They can be sorted by recommended
match, followed channels first, viewers high-to-low or low-to-high, longest
live (the best available "ending soon" proxy), or most recently started. It
can also **start the raid** for you directly, via the Twitch API. After a raid
starts, Wormhole displays Twitch's 90-second countdown with a cancel option.
When the countdown finishes, Wormhole waits for Twitch's actual `channel.raid`
EventSub confirmation. Only that confirmation sends the completion chat
message and opens an in-app destination view containing the raided channel's
official Twitch player and chat embeds.

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
   - `https://wormhole.netlify.app/` for Netlify

   You can register multiple redirect URLs on the same app, so add both your
   local and production URLs.
4. Client type: **Confidential**. Twitch currently limits Public clients to
   Device Code Flow, so Public will not work with this browser redirect. The
   implicit flow still uses only the public Client ID: do **not** put the
   generated client secret in Wormhole or any frontend file.
5. Save, then copy the **Client ID**.

Open `js/config.js` and paste it in:

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
- **Netlify / Vercel**: drag-and-drop the folder, or connect the repo.
- **Any web host**: it's just static files — upload as-is.

Whatever URL it ends up live at, make sure that exact URL is registered as
an OAuth Redirect URL on your Twitch app (step 1).

### Optional protected Netlify actions

The app still works as a static site. For a Netlify deployment, v44 also ships
an optional same-origin serverless gate for raid start, raid cancellation, and
the opted-in completion chat message. It validates the Twitch token on every
mutation, verifies that the token owner is the initiating broadcaster/sender,
rejects cross-origin requests, limits accepted fields, and never retries a
mutation automatically.

1. In Netlify, set `TWITCH_CLIENT_ID` to the same public Client ID used in
   `js/config.js`.
2. Set `WORMHOLE_ALLOWED_ORIGIN` to the exact production origin, such as
   `https://wormhole.netlify.app` (no trailing slash).
3. Change `backendActions` to `true` in `js/config.js`.
4. Deploy the folder. The included `netlify.toml` publishes the site, exposes
   `/api/raid-action`, applies security headers, and configures safe asset
   caching.

Do not put a Twitch client secret in the frontend or in this package. This
gate validates the existing user token; an authorization-code migration would
be required to move Twitch tokens completely into HttpOnly cookies.

## Reliability and safety

- GET requests have a 15-second timeout, bounded retry behavior for transient
  Twitch failures, rate-limit header tracking, and cancellation when a newer
  search replaces an older one.
- Raid and chat mutations are never retried automatically.
- The selected destination is checked again immediately before raid start.
- The EventSub connection exposes its current state. Completion-message opt-in
  is unavailable unless confirmation is connected; Twitch reconnect
  instructions are honored and duplicate messages are ignored.
- OAuth state expires after ten minutes to narrow the callback replay window.
- `netlify.toml` adds clickjacking, MIME-sniffing, referrer, permissions, and
  opener protections.

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
  - **Following only** — limits recommendations to live channels already in
    the logged-in user's Twitch follow list. If Twitch's follow lookup fails,
    the app stops the filtered search instead of pretending there are no
    matches. With no category selected, Wormhole uses Twitch's dedicated
    followed-streams endpoint and paginates through every followed channel
    currently live instead of filtering a capped Twitch-wide discovery sample.
    Audience, status, team, and tag filters still apply when selected.
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
- Result cards show Twitch's mature flag and content-classification labels so
  creators can spot potential community-safety mismatches before raiding.
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
Optional history covers viewer samples, channel/category snapshots, and up to
five previous-stream references. Until permission is given, those optional
records are neither read nor written.

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
streamer can preview **“Wormhole Networking Tool has completed the Raid to
@destination”** and explicitly opt in to sending it through
`POST /helix/chat/messages`. The choice is off by default and applies only to
that raid.
This requires the `user:write:chat` scope, so existing users must log out and
authorize the updated permission once. A failed or dropped message does not
undo the raid; the in-app destination view reports the delivery result and
still loads Twitch's official live player and chat. Wormhole no longer
redirects the browser away from the app after a raid.
During the pending countdown, **Open Twitch Raid Controls** opens the logged-in
streamer's official Twitch Stream Manager in a new tab. The streamer may use
Twitch's own **Raid Now** control there to complete immediately; Wormhole does
not attempt to imitate or bypass that protected Twitch action.

---

## Project structure

```
index.html          # Page shell, both views (login + app)
privacy.html        # Storage and privacy policy
css/styles.css       # All styling
js/
  config.js          # Client ID, scopes, redirect URI
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
  app.js              # Wires everything together, renders the UI
tests/
  raid-match.test.mjs # Core matching behavior tests
  twitch-auth.test.mjs # Twitch login security and redirect tests
```

There are no runtime dependencies and no build step. `package.json` only
provides the local test command. The only external page resources are Google
Fonts (Space Grotesk, Inter, IBM Plex Mono).
