# ESPN API Integration — Prep Notes

Status: **live-tested once, thin results.** First live test (preview deploy)
came back with only ~5 games instead of a full slate. Root cause: querying
ESPN by `week`/`season`/`seasontype` number doesn't reliably resolve to the
full slate — it can silently narrow to just the games happening "now"
instead of erroring. Switched the primary query to an explicit
`dates=YYYYMMDD-YYYYMMDD` range instead (see "Fetch by date range" below),
which is the more reliable way ESPN's own site queries by week. Re-test
after this change and update this file with the actual result.

This session's sandbox also has outbound access to `site.api.espn.com`
blocked, so the JSON shape assumptions below still haven't been verified
directly from here — only inferred from the one thin live test.

## What's here

- **`espn-api.js`** — client-side module (`window.ESPN_API`). Fetches NFL and
  FBS scoreboard data for a given week and maps each ESPN "event" into the
  exact same game-object shape the admin panel already uses for Yahoo-pasted
  games (`id`, `week`, `season`, `league`, `homeTeam`, `homeAbbr`, `awayTeam`,
  `awayAbbr`, `gameTime`, `currentSpread`, `status`, `homeScore`, `awayScore`,
  `spreadResult`, …), plus two fields Yahoo-pasted games don't have:
  `homeRank`/`awayRank` — AP/CFP poll rank (1-25) when ESPN reports the team
  as ranked, `null` otherwise, pulled from `curatedRank.current` (ESPN uses
  `99` for unranked, not a missing field — the mapper only keeps 1-25).
  Shown as a badge next to the team name on the picks page and in the
  admin's ESPN preview table. Because the rest of the shape matches, ESPN-
  sourced games work with picks, locking, scoring, and the leaderboard with
  zero changes needed in those files.
- **`api/espn-scoreboard.js`** — a Vercel serverless function that proxies
  `site.api.espn.com/apis/site/v2/sports/football/{nfl|college-football}/scoreboard`.
  `espn-api.js` calls this first (same-origin, no browser CORS risk, keeps the
  ESPN endpoint URL server-side) and only falls back to calling ESPN directly
  if the proxy isn't reachable. Vercel auto-detects the `/api` folder — no
  config needed, it just deploys alongside the static files.
- **Admin panel** (`dlc-admin-panel-firebase-FINAL.html`, "Load New Week"
  tab) — new "🏈 Auto-load from ESPN (beta)" card above the existing Yahoo
  paste box. Pick a week/season/leagues, hit **Fetch from ESPN**, review the
  preview table, then **Import These Games** — same preview-before-commit
  pattern as the Yahoo flow, so nothing is written to Firebase until you
  explicitly import. The Yahoo paste box stays as the fallback.

## Fetch by date range

The admin panel's ESPN card now has **From/To date pickers** (defaulting to
today through +6 days) instead of a bare week number. Those get formatted
into `dates=YYYYMMDD-YYYYMMDD` and sent to ESPN — that's the query that
actually determines which games come back. "Tag as Week/Season" are separate
fields that only label the imported game objects (for the app's own
week-grouping); they don't affect what ESPN returns.

The fetch status line now also shows a `mapped/raw` count per league, e.g.
`NFL 14/14, FBS 61/63` — pulled from `ESPN_API.lastFetchDebug`. Use it to
tell apart the two ways this can go wrong:
- **Low raw count** → the query itself is too narrow (wrong date range, or
  ESPN just doesn't have much on those dates — check the range covers the
  right weekend).
- **raw > mapped** → events came back but some failed to map (missing
  competitors, unexpected shape) — check the browser console, `mapEventToGame`
  is probably choking on a field ESPN sends that isn't handled yet.

## Why it's built this way

- **Preview-then-import, never auto-write.** Matches the existing Yahoo flow
  and keeps this from ever silently overwriting spreads, scores, or picks —
  which is the thing most likely to break the Sunday email workflow if it
  went wrong.
- **Serverless proxy instead of calling ESPN from the browser.** ESPN's site
  API is undocumented/unofficial; its CORS behavior isn't something to build
  production reliability on. A same-origin proxy sidesteps that and gives a
  single place to add caching, retries, or an API key later.
- **Spread parsed from the odds `details` string** (e.g. `"DAL -3.5"`, `"PK"`)
  rather than trusted from a raw signed `spread` number, because that sign
  convention isn't confirmed live. Parsing the readable string and comparing
  the named team to the home team's abbreviation is more robust either way.

## Known unknowns — verify these first

1. **Actual response shape.** The mapper assumes the commonly-documented
   ESPN site API shape (`events[].competitions[0].competitors[]`,
   `.odds[0].details`, `.status.type.state`). Fetch one real week and diff it
   against `mapEventToGame()` in `espn-api.js` before relying on this.
2. **Odds coverage.** ESPN doesn't always carry a spread for every game,
   especially FBS/Group of 5 games or games far out from kickoff. When
   `currentSpread` comes back `null`, the admin still needs to fill it in
   manually (same as it does today when Yahoo's article doesn't have a line
   yet).
3. **CORS on the direct-fetch fallback.** Not guaranteed to keep working;
   the proxy is the real path — don't remove it in favor of just doing this.
4. **`groups=80`** on the college endpoint scopes to FBS, matching what the
   Yahoo flow calls "FBS." Not re-verified live.
5. **Season type.** `seasontype=1` preseason, `2` regular, `3` postseason.
   The UI hardcodes `2` in `espn-api.js`'s default; add a selector if the
   commissioner ever needs preseason or bowl-season loading.

## Suggested next steps (not done yet, on purpose)

- **Live-test the fetch** once deployed, for both NFL and FBS, and fix the
  mapper against real data.
- **Score sync** — reusing the same fetch to auto-fill `homeScore`/
  `awayScore` for the "Enter Scores" tab. Deliberately left out of this pass:
  it touches the scoring/grading path directly, which is the one thing the
  handoff notes said not to break, so it deserves its own careful pass with
  explicit preview-before-write, same as game loading.
- **Weekly automation (Vercel Cron)** — a `vercel.json` cron entry hitting a
  new `/api/espn-autoload` route on a schedule, writing straight to Firebase.
  Intentionally not built yet: it removes the human-review step this whole
  design leans on, and needs its own decision about how conflicts with
  manually-adjusted spreads get handled.
- **Player authentication** and the **historical stats dashboard** are
  separate priorities from the handoff notes, untouched here.

## Yahoo auto-fetch (the fallback path)

`api/yahoo-scoreboard.js` + the "🔄 Fetch from Yahoo" button (Load New Week
tab) do the same job for the Yahoo fallback that ESPN's auto-load does for
the primary path — but Yahoo has no public API, so this works completely
differently under the hood: the serverless function fetches a Yahoo page's
raw HTML, strips it down to plain text, and feeds that through the *same*
`parseYahooSpreads()` parser the manual paste box always used. It's
automating the copy step, not adding a real integration.

Source URL: `sports.yahoo.com/nfl/schedule/` (and the
`college-football/schedule/` equivalent for FBS). This replaced an initial
guess at a `/betting/` path that 404d in production. The commissioner
confirmed the NFL schedule URL is stable and always shows the current
week — no per-week URL to maintain, unlike the old article-based pages
this originally pointed at. The FBS URL follows the same pattern but
wasn't separately confirmed. If either starts 404ing or coming back with
0 parsed games, the admin panel's Yahoo card has a URL field to override
it live without a code change — check that first.

This makes it meaningfully more fragile than the ESPN path:
- No JSON contract — any redesign of Yahoo's page markup can silently
  break the text extraction or feed the parser garbage.
- A schedule page may not carry spread numbers the same way a betting/odds
  page would — if fetches keep returning 0 games even though the page
  loads fine, that's the first thing to check, not just a markup change.
- Not verified against Yahoo's live page (same "no network access to test
  from this environment" caveat as the original ESPN work, but with a much
  flimsier fallback if it's wrong — HTML scraping has no schema to fail
  loudly against).
- The parser's line-filtering (only keeps lines shaped like
  `Team at Team (-N, N)`) does most of the work of ignoring nav/footer/ad
  noise from the full-page text dump, which is what makes this workable at
  all rather than a bad idea outright.

**Always check the preview table before importing**, same as manual paste —
that safety net is exactly why this was built as "auto-fill the paste box"
rather than a separate no-preview import path.
