# ESPN API Integration — Prep Notes

Status: **groundwork laid, not yet live-tested.** This session's sandbox had
outbound access to `site.api.espn.com` blocked, so nothing here has been
verified against a real response. Test it for real the first time you use it,
before trusting it during an actual week.

## What's here

- **`espn-api.js`** — client-side module (`window.ESPN_API`). Fetches NFL and
  FBS scoreboard data for a given week and maps each ESPN "event" into the
  exact same game-object shape the admin panel already uses for Yahoo-pasted
  games (`id`, `week`, `season`, `league`, `homeTeam`, `homeAbbr`, `awayTeam`,
  `awayAbbr`, `gameTime`, `currentSpread`, `status`, `homeScore`, `awayScore`,
  `spreadResult`, …). Because it reuses that shape, ESPN-sourced games work
  with picks, locking, scoring, and the leaderboard with zero changes needed
  in those files.
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
