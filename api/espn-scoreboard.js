// api/espn-scoreboard.js
// Vercel serverless proxy for ESPN's public scoreboard API.
//
// Exists because the admin panel calls this from the browser — a
// same-origin proxy sidesteps ESPN CORS behavior we can't rely on
// long-term, keeps the ESPN endpoint shape server-side (one place to
// fix if ESPN changes it), and gives us a spot to add caching or an
// API key later without touching the client.
//
// GET /api/espn-scoreboard?league=nfl|cfb&week=8&year=2025&seasontype=2

const LEAGUE_PATHS = {
  nfl: 'football/nfl',
  cfb: 'football/college-football'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { league = 'nfl', week, seasontype = '2', year, dates } = req.query;
  const path = LEAGUE_PATHS[league];
  if (!path) {
    res.status(400).json({ error: `Unknown league "${league}". Use "nfl" or "cfb".` });
    return;
  }

  // `dates=YYYYMMDD-YYYYMMDD` is the reliable path — prefer it when given.
  // Falls back to week/seasontype/year, which ESPN doesn't always resolve
  // to the full slate you'd expect.
  const params = new URLSearchParams();
  if (dates) {
    params.set('dates', String(dates));
  } else {
    params.set('seasontype', String(seasontype));
    if (week) params.set('week', String(week));
    if (year) params.set('year', String(year));
  }
  if (league === 'cfb') params.set('groups', '80'); // FBS

  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?${params}`;

  try {
    const espnRes = await fetch(url);
    if (!espnRes.ok) {
      res.status(espnRes.status).json({ error: `ESPN API returned ${espnRes.status}` });
      return;
    }
    const data = await espnRes.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach ESPN API', detail: err.message });
  }
};
