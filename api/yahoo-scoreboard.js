// api/yahoo-scoreboard.js
// Serverless proxy that fetches a Yahoo Sports betting page and returns
// its text content, stripped of HTML - automates the "open the page,
// select all, copy" step that used to be fully manual, feeding the
// result into the same parseYahooSpreads() parser the paste box already
// uses in the admin panel.
//
// Unlike ESPN, Yahoo has no public API - this scrapes rendered HTML,
// which is inherently more fragile than the ESPN JSON integration and
// WILL break if Yahoo changes their page markup. The nfl/schedule/ URL
// was confirmed by the commissioner to be a stable, always-current page
// (unlike the article-based pages this originally pointed at, which get
// a new URL every week); the college-football/schedule/ counterpart
// follows the same URL pattern but wasn't separately confirmed. Neither
// was verified against Yahoo's live page from the environment this was
// built in (no network access to sports.yahoo.com from here), and a
// schedule page may or may not carry spread numbers the same way a
// betting/odds page would - if fetches keep coming back with 0 games,
// that's the first thing to check. The parser's own line-filtering (it
// only keeps lines matching a "Team at Team (-N, N)" pattern) does a
// lot of the work of ignoring nav/footer/ad noise from the full page
// text either way, but always check the preview table before
// importing - same as manual paste.
//
// GET /api/yahoo-scoreboard?league=nfl|fbs
// GET /api/yahoo-scoreboard?url=https://sports.yahoo.com/...  (overrides league default)
//
// The `url` override exists because the default guesses below are just
// that - guesses, unverified against Yahoo's live site (see caveat
// above). If Yahoo restructures their site and this starts 404ing, the
// admin panel's Yahoo card has a URL field so anyone can just paste in
// whatever page currently has the spreads without needing a code change
// here. Restricted to yahoo.com hosts so this can't be turned into an
// open proxy for arbitrary URLs.

// The schedule page (not a betting/odds subpage) - confirmed by the
// commissioner to be a stable URL that always shows the current week
// and doesn't change week to week, unlike the old article-based pages
// this was originally pointed at.
const SOURCE_URLS = {
  nfl: 'https://sports.yahoo.com/nfl/schedule/',
  fbs: 'https://sports.yahoo.com/college-football/schedule/'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { league = 'nfl', url: customUrl } = req.query;

  let url;
  if (customUrl) {
    let parsed;
    try {
      parsed = new URL(customUrl);
    } catch (e) {
      res.status(400).json({ error: 'Invalid url parameter.' });
      return;
    }
    if (!/(^|\.)yahoo\.com$/i.test(parsed.hostname)) {
      res.status(400).json({ error: 'url must be a yahoo.com page.' });
      return;
    }
    url = parsed.toString();
  } else {
    url = SOURCE_URLS[league];
    if (!url) {
      res.status(400).json({ error: `Unknown league "${league}". Use "nfl" or "fbs".` });
      return;
    }
  }

  try {
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });
    if (!pageRes.ok) {
      res.status(pageRes.status).json({ error: `Yahoo returned ${pageRes.status}` });
      return;
    }
    const html = await pageRes.text();
    const text = htmlToPlainText(html);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ text, sourceUrl: url });
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Yahoo', detail: err.message });
  }
};

function htmlToPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*\n+/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
}
