// fbs-conferences.js
// Best-effort FBS team → conference lookup, used to power the picks page's
// conference filter chips (Big Ten, SEC, etc.). There's no conference field
// on the game objects themselves (Yahoo-pasted games never had one, and
// ESPN's scoreboard endpoint doesn't return it either), so this matches by
// team name instead: a game counts as e.g. "SEC" if either team's name
// starts with a known SEC school name.
//
// Rosters reflect conference realignment as of the 2024 season (Big Ten's
// and SEC's expansions, the Pac-12 breakup into Big 12/ACC, etc.) — this
// will drift as conferences keep shuffling and needs the occasional
// manual update; it wasn't checked against a live source.

const FBS_CONFERENCES = [
  { key: 'big-ten', label: 'Big Ten', teams: [
    'Illinois', 'Indiana', 'Iowa', 'Maryland', 'Michigan State', 'Michigan',
    'Minnesota', 'Nebraska', 'Northwestern', 'Ohio State', 'Oregon',
    'Penn State', 'Purdue', 'Rutgers', 'UCLA', 'USC', 'Southern California',
    'Washington', 'Wisconsin'
  ]},
  { key: 'sec', label: 'SEC', teams: [
    'Alabama', 'Arkansas', 'Auburn', 'Florida', 'Georgia', 'Kentucky', 'LSU',
    'Mississippi State', 'Missouri', 'Oklahoma', 'Ole Miss', 'South Carolina',
    'Tennessee', 'Texas A&M', 'Texas', 'Vanderbilt'
  ]},
  { key: 'acc', label: 'ACC', teams: [
    'Boston College', 'California', 'Clemson', 'Duke', 'Florida State',
    'Georgia Tech', 'Louisville', 'Miami', 'NC State', 'North Carolina',
    'Pittsburgh', 'Pitt', 'SMU', 'Stanford', 'Syracuse', 'Virginia Tech',
    'Virginia', 'Wake Forest'
  ]},
  { key: 'big-12', label: 'Big 12', teams: [
    'Arizona State', 'Arizona', 'Baylor', 'BYU', 'Cincinnati', 'Colorado',
    'Houston', 'Iowa State', 'Kansas State', 'Kansas', 'Oklahoma State',
    'TCU', 'Texas Tech', 'UCF', 'Utah', 'West Virginia'
  ]},
  { key: 'american', label: 'American', teams: [
    'Army', 'Charlotte', 'East Carolina', 'Florida Atlantic', 'Memphis',
    'Navy', 'North Texas', 'Rice', 'South Florida', 'Temple', 'Tulane',
    'Tulsa', 'UAB', 'UTSA'
  ]},
  { key: 'mountain-west', label: 'Mountain West', teams: [
    'Air Force', 'Boise State', 'Colorado State', 'Fresno State', 'Hawaii',
    'Nevada', 'New Mexico', 'San Diego State', 'San Jose State', 'UNLV',
    'Utah State', 'Wyoming'
  ]},
  { key: 'mac', label: 'MAC', teams: [
    'Akron', 'Ball State', 'Bowling Green', 'Buffalo', 'Central Michigan',
    'Eastern Michigan', 'Kent State', 'Miami (OH)', 'Northern Illinois',
    'Ohio', 'Toledo', 'Western Michigan'
  ]},
  { key: 'sun-belt', label: 'Sun Belt', teams: [
    'Appalachian State', 'Arkansas State', 'Coastal Carolina',
    'Georgia Southern', 'Georgia State', 'James Madison', 'Louisiana Monroe',
    'Louisiana', 'Marshall', 'Old Dominion', 'South Alabama',
    'Southern Miss', 'Texas State', 'Troy'
  ]},
  { key: 'cusa', label: 'C-USA', teams: [
    'Delaware', 'FIU', 'Jacksonville State', 'Kennesaw State', 'Liberty',
    'Louisiana Tech', 'Middle Tennessee', 'Missouri State',
    'New Mexico State', 'Sam Houston', 'UTEP', 'Western Kentucky'
  ]},
  { key: 'independents', label: 'Independents', teams: [
    'Notre Dame', 'UConn', 'UMass'
  ]}
];

// Flattened + sorted longest-name-first so a more specific match (e.g.
// "Miami (OH)") is tried before a shorter one that's also a prefix match
// (e.g. "Miami"), and built once at load rather than per game/filter click.
const FBS_TEAM_LOOKUP = FBS_CONFERENCES
  .flatMap(c => c.teams.map(team => ({ key: team.toLowerCase(), conf: c.key })))
  .sort((a, b) => b.key.length - a.key.length);

function getConferenceForTeam(teamName) {
  const name = (teamName || '').trim().toLowerCase();
  if (!name) return null;
  const match = FBS_TEAM_LOOKUP.find(entry => name.startsWith(entry.key));
  return match ? match.conf : null;
}

if (typeof window !== 'undefined') {
  window.FBS_CONFERENCES = FBS_CONFERENCES;
  window.getConferenceForTeam = getConferenceForTeam;
}
