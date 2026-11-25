// Checks which mode and banner the page opens with: Live now and the
// ski-season banner inside DATA.live_season, Typical season and the
// off-season banner outside it. Needs the debug page so ?today= can fix the
// date (see debug_hooks.js); run it once per date, on a fresh page load:
//
//   http://localhost:8000/tmp/debug.html?today=2026-11-25   (in season)
//   http://localhost:8000/tmp/debug.html?today=2026-07-01   (off-season)
//
//   await (0, eval)(await (await fetch('/test/browser/season_default_check.js')).text())
(async () => {
  const $ = (s) => document.querySelector(s);
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

  const today = window.__todayOverride;
  const data = JSON.parse($('#ski-data').textContent);
  check('the page was opened with ?today= on the debug page', !!today, location.href);
  check('the generated data carries the live-season window',
    data.live_season && /^\d\d-\d\d$/.test(data.live_season.from) && /^\d\d-\d\d$/.test(data.live_season.to), data.live_season);

  // Independent of app.js: the window as written in config/season.json, wrapping the year.
  const md = today.slice(5), from = data.live_season.from, to = data.live_season.to;
  const inSeason = from <= to ? (md >= from && md <= to) : (md >= from || md <= to);
  const visible = (el) => !el.hidden && getComputedStyle(el).display !== 'none';

  check(`opens in ${inSeason ? 'Live now' : 'Typical season'} on ${today}`,
    $(inSeason ? '#mode-live' : '#mode-season').classList.contains('is-active'));
  check('exactly the matching banner is visible',
    visible($('#banner-season')) === inSeason && visible($('#banner-off')) === !inSeason);
  check('the slider is enabled only in Typical season', $('#date-slider').disabled === inSeason);
  check('the fetch line matches the mode',
    inSeason ? !/^TYPICAL SEASON SHOWN/.test($('#fetch-meta').textContent) : /^TYPICAL SEASON SHOWN/.test($('#fetch-meta').textContent),
    $('#fetch-meta').textContent);
  check('no banner mentions a hard-coded month for "now"', !/in September/.test($('#banner-off').textContent));

  const failures = results.filter((r) => !r.ok);
  console.log(`season_default_check (${today}): ${results.length - failures.length}/${results.length} passed`, failures);
  return { today, inSeason, passed: results.length - failures.length, failed: failures.length, failures };
})();
