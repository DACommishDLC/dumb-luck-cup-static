// espn-api.js
// Client for ESPN's public (undocumented) scoreboard API.
// Fetches games + point spreads for NFL and FBS college football and
// maps them into the same game-object shape the admin panel already
// uses for Yahoo-pasted games (see importParsedGames() in
// dlc-admin-panel-firebase-FINAL.html) — so ESPN-sourced games drop
// straight into the existing games array, Firebase schema, picks page,
// scoring, and leaderboard with no changes needed there.
//
// Prefers the /api/espn-scoreboard serverless proxy (same-origin, no
// CORS issues, keeps ESPN's endpoint details server-side). Falls back
// to calling ESPN directly if the proxy isn't deployed yet.
//
// NOTE: not yet verified against a live response (this endpoint was
// unreachable from the environment this was written in). Test a real
// fetch after deploying and adjust _parseOddsDetails / mapEventToGame
// if ESPN's field names differ from what's documented here.

const ESPN_API = {
  PROXY_PATH: '/api/espn-scoreboard',

  LEAGUE_PATHS: {
    nfl: 'football/nfl',
    cfb: 'football/college-football'
  },

  async _fetchScoreboard(league, { week, season, seasontype = 2, dates } = {}) {
    // Querying by an explicit date range (`dates=YYYYMMDD-YYYYMMDD`) is the
    // more reliable way to get a full slate from ESPN — `week` numbering
    // doesn't always resolve to the games you'd expect, especially for
    // college football with its many groups/conferences, and can silently
    // fall back to just "today's" games instead of erroring.
    const params = new URLSearchParams();
    if (dates) {
      params.set('dates', dates);
    } else {
      params.set('seasontype', String(seasontype));
      if (week) params.set('week', String(week));
      if (season) params.set('year', String(season));
    }

    // 1. Try the same-origin serverless proxy first.
    try {
      const proxyUrl = `${this.PROXY_PATH}?league=${league}&${params}`;
      const res = await fetch(proxyUrl);
      if (res.ok) return await res.json();
      console.warn(`ESPN proxy responded ${res.status}, falling back to direct fetch`);
    } catch (e) {
      console.warn('ESPN proxy unreachable, falling back to direct fetch:', e.message);
    }

    // 2. Fall back to calling ESPN directly (works only if ESPN's CORS
    //    headers allow it from the browser; not guaranteed long-term,
    //    which is exactly why the proxy above is the preferred path).
    const path = this.LEAGUE_PATHS[league];
    if (league === 'cfb') params.set('groups', '80'); // FBS
    const directUrl = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?${params}`;
    const res = await fetch(directUrl);
    if (!res.ok) throw new Error(`ESPN API returned ${res.status} for ${league}`);
    return await res.json();
  },

  /**
   * Parses an ESPN odds "details" string like "DAL -3.5" or "PK" into
   * { favoriteAbbr, spread }. Returns null if there's no line yet.
   */
  _parseOddsDetails(details) {
    if (!details) return null;
    const trimmed = details.trim();
    if (/^(pk|even)$/i.test(trimmed)) return { favoriteAbbr: null, spread: 0 };
    const match = trimmed.match(/^([A-Z]{2,4})\s+(-?\d+\.?\d*)$/);
    if (!match) return null;
    return { favoriteAbbr: match[1], spread: parseFloat(match[2]) };
  },

  /**
   * Maps one ESPN scoreboard "event" into the app's game-object shape.
   * currentSpread follows the app's existing convention (see
   * parseYahooSpreads() in the admin panel): negative = home team
   * favored by that many points, positive = home team getting that
   * many points. Derived from the favorite's abbreviation rather than
   * trusting ESPN's raw spread sign, since that convention isn't
   * confirmed against a live response yet.
   */
  mapEventToGame(event, { league, week, season }) {
    const competition = event.competitions?.[0];
    if (!competition) return null;

    const home = competition.competitors?.find(c => c.homeAway === 'home');
    const away = competition.competitors?.find(c => c.homeAway === 'away');
    if (!home || !away) return null;

    const oddsDetails = competition.odds?.[0]?.details;
    const parsedOdds = this._parseOddsDetails(oddsDetails);

    let currentSpread = null;
    if (parsedOdds) {
      if (parsedOdds.favoriteAbbr === null) {
        currentSpread = 0; // pick'em
      } else if (parsedOdds.favoriteAbbr === home.team.abbreviation) {
        currentSpread = parsedOdds.spread; // already negative
      } else {
        currentSpread = Math.abs(parsedOdds.spread);
      }
    }

    const stateMap = { pre: 'scheduled', in: 'live', post: 'final' };
    const espnState = competition.status?.type?.state;

    // ESPN reports AP/CFP rank as curatedRank.current, using 99 for
    // "unranked" rather than omitting the field — only 1-25 counts.
    const rankOf = (competitor) => {
      const r = competitor.curatedRank?.current;
      return (typeof r === 'number' && r >= 1 && r <= 25) ? r : null;
    };

    return {
      id: `espn-${event.id}`,
      week: week ?? event.week?.number ?? null,
      season: season ?? null,
      league,
      homeTeam: home.team.displayName,
      homeAbbr: home.team.abbreviation,
      homeRank: rankOf(home),
      awayTeam: away.team.displayName,
      awayAbbr: away.team.abbreviation,
      awayRank: rankOf(away),
      gameTime: competition.date,
      currentSpread,
      spreadLastUpdated: new Date().toISOString(),
      finalSpread: null,
      status: stateMap[espnState] || 'scheduled',
      homeScore: espnState === 'pre' ? null : Number(home.score),
      awayScore: espnState === 'pre' ? null : Number(away.score),
      spreadResult: null,
      espnEventId: event.id
    };
  },

  /**
   * Fetches and maps every game for a given week/date-range across one or
   * more leagues. League labels ('NFL' / 'FBS') match what the rest of the
   * admin panel already uses for the `league` field.
   *
   * Pass `dates: 'YYYYMMDD-YYYYMMDD'` for the reliable path (recommended).
   * `week`/`season` are also sent to `week` and `season` are still used to
   * tag the resulting game objects even in `dates` mode.
   *
   * After each call, `ESPN_API.lastFetchDebug` holds
   * `{ nfl: { raw, mapped }, cfb: { raw, mapped } }` — raw is how many
   * events ESPN actually returned, mapped is how many survived mapping.
   * A raw count that's way lower than expected means the query itself
   * (week/dates/season) is scoped too narrow; a gap between raw and
   * mapped means events are failing to map (check mapEventToGame).
   */
  async fetchWeekGames({ week, season, seasontype = 2, dates, leagues = ['nfl', 'cfb'] }) {
    const labelFor = { nfl: 'NFL', cfb: 'FBS' };
    this.lastFetchDebug = {};
    const results = await Promise.all(
      leagues.map(async (league) => {
        const data = await this._fetchScoreboard(league, { week, season, seasontype, dates });
        const events = data.events || [];
        const mapped = events
          .map(ev => this.mapEventToGame(ev, { league: labelFor[league], week, season }))
          .filter(Boolean);
        this.lastFetchDebug[league] = { raw: events.length, mapped: mapped.length };
        return mapped;
      })
    );
    return results.flat().sort((a, b) => new Date(a.gameTime) - new Date(b.gameTime));
  }
};

if (typeof window !== 'undefined') {
  window.ESPN_API = ESPN_API;
}
