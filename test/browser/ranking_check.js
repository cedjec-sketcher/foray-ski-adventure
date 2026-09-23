// Browser check for the Top-10 lists. Run it inside tmp/debug.html (see
// scripts/build_debug_page.rb and README "Browser checks"); it drives the real
// page and compares what's on screen with an expected ranking computed here,
// independently of app.js, from the same synthetic winter the page is fed.
//
// It runs whichever scenario the URL asks for:
//   ?winter&mockDelay=300           normal: ranking, tie-breaking, filters, modes
//   ?winter&mockFail=2              a batch of live data fails: warn, don't break
//   ?winter&mockDepth=0             off-season: no snow anywhere
//
// From a console or the browser tool:
//   await (0, eval)(await (await fetch('/test/browser/ranking_check.js')).text())
// It resolves to { scenario, passed, failed, failures }.
(async function(){
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? undefined : detail });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms = 8000){
    const t0 = Date.now();
    while(Date.now() - t0 < ms){ if(fn()) return true; await sleep(40); }
    return false;
  }

  const map = window.__map;
  if(!map || !window.__mockWinter) return { error: 'Open tmp/debug.html?winter (see scripts/build_debug_page.rb)' };
  // Animated map moves never finish in a background tab; the logic under test doesn't care.
  const fb = map.fitBounds.bind(map), sv = map.setView.bind(map);
  map.fitBounds = (b, o) => fb(b, Object.assign({}, o, { animate: false }));
  map.setView = (c, z, o) => sv(c, z, Object.assign({}, o, { animate: false }));

  const q = new URLSearchParams(location.search);
  const data = JSON.parse(document.getElementById('ski-data').textContent).resorts;
  const depth = (r) => window.__mockWinter.depthCm(r);
  const byName = (n) => data.find((r) => r.name === n);

  const $ = (sel) => document.querySelector(sel);
  const status = () => $('#filter-status').textContent;
  const chip = (group, label) => [...document.querySelectorAll(group + ' .chip')].find((c) => c.textContent.startsWith(label));
  const rows = () => [...document.querySelectorAll('.resort-row')].filter((r) => !r.hidden).map((row) => ({
    name: row.querySelector('.name-text').textContent,
    rank: row.querySelector('.rank').hidden ? null : row.querySelector('.rank').textContent,
    live: row.querySelector('.live').textContent,
    inGroup: !!row.closest('.region-group'),
  }));
  const names = () => rows().map((r) => r.name);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const live = () => $('#mode-live').click();
  const season = () => $('#mode-season').click();
  const clearAll = async () => { const c = $('#clear-filters'); if(!c.hidden) c.click(); await sleep(250); };
  const rankBoxVisible = () => !$('.rank-group').hidden;
  const groupsVisible = () => document.querySelectorAll('.region-group:not([hidden])').length;
  const settle = () => waitFor(() => !/^Fetching/.test(status()));

  // Expected lists, written from the rules in the task, not copied from app.js.
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const expSnow = (pool) => pool.filter((r) => depth(r) > 0)
    .sort((a, b) => depth(b) - depth(a) || (b.elevation_top_m || 0) - (a.elevation_top_m || 0) || byId(a, b))
    .slice(0, 10).map((r) => r.name);
  const expAlt = (pool) => pool.filter((r) => r.elevation_top_m > 0)
    .sort((a, b) => b.elevation_top_m - a.elevation_top_m || (b.run_km || 0) - (a.run_km || 0) || byId(a, b))
    .slice(0, 10).map((r) => r.name);

  // Marker DOM/Tab order should always match the list's own order (region,
  // then largest first) - computed independently here, not by calling the
  // app's own sortResorts, so this actually checks the rendered DOM rather
  // than checking the app against itself. See the "Keyboard Tab order" fix
  // in docs/CHANGELOG.md.
  const REGION_ORDER = ['Hokkaido', 'Tohoku', 'Kanto', 'Niigata', 'Nagano', 'Chubu', 'Western Japan'];
  const domMarkerOrder = () => [...document.querySelectorAll('path.marker:not(.marker-dim)')]
    .map((el) => el.getAttribute('aria-label').split(',')[0]);
  const expectedOrderFor = (names) => data.filter((r) => names.includes(r.name)).slice()
    .sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || (b.run_km || 0) - (a.run_km || 0))
    .map((r) => r.name);
  const checkMarkerOrder = (label) => {
    const got = domMarkerOrder();
    check('marker DOM/Tab order (' + label + ') matches region+size order', same(got, expectedOrderFor(got)), got);
  };

  await sleep(700); // the page's own first live refresh (the 27 major resorts)
  const scenario = q.has('mockFail') ? 'failure' : (q.get('mockDepth') === '0' ? 'off-season' : 'winter');

  if(scenario === 'winter'){
    checkMarkerOrder('initial load, before any interaction');

    live(); await sleep(300);
    const snowChip = chip('#ranking-chips', 'Snowiest');
    check('Snowiest chip is enabled in Live mode', !snowChip.disabled);

    // -- snow ranking, national
    snowChip.click(); await sleep(120);
    check('shows a fetching state while live depths load (needs mockDelay)', /^Fetching live snow depth/.test(status()), status());
    check('shows no ranking while it is still waiting for data', rows().every((r) => r.rank === null) && !rankBoxVisible());
    check('the ranking settles', await settle(), status());
    await sleep(150);

    const want = expSnow(data);
    check('lists exactly the expected top 10, in order', same(names(), want), { got: names(), want });
    check('rank badges run 1..10', same(rows().map((r) => r.rank), ['1','2','3','4','5','6','7','8','9','10']), rows().map((r) => r.rank));
    check('each row shows its resort\'s depth', rows().every((r) => r.live === depth(byName(r.name)) + 'cm now'), rows());
    check('rows are in the ranking box, region groups are hidden', rankBoxVisible() && groupsVisible() === 0 && rows().every((r) => !r.inGroup));
    const ds = want.map((n) => depth(byName(n)));
    check('this run exercises a tie inside the top 10', ds.some((d, i) => i > 0 && d === ds[i - 1]), ds);
    check('each resort was fetched once: 477 locations in total', window.__fetches.reduce((a, b) => a + b, 0) === data.length, window.__fetches);
    check('requests are batched at 100 or fewer', window.__fetches.every((n) => n <= 100), window.__fetches);
    check('status names the list and warns about ties', /Top 10 snowiest now/.test(status()) && /neighbours can tie/.test(status()), status());

    const labels = [...document.querySelectorAll('path.marker:not(.marker-dim)')].map((e) => e.getAttribute('aria-label'));
    check('every ranked resort is drawn as an active marker', want.every((n) => labels.some((l) => l && l.startsWith(n + ','))), labels);
    check('and nothing else is (bar the selected resort)', labels.length >= 10 && labels.length <= 11, labels.length);
    check('the top 10 includes a resort that is not major (so the always-reveal rule is exercised)', want.some((n) => byName(n).tier !== 'major'), want.map((n) => byName(n).tier));
    const bounds = map.getBounds();
    check('the map zooms to fit the list', want.every((n) => bounds.contains([byName(n).lat, byName(n).lon])));

    // -- snow ranking within a region
    chip('#region-chips', 'Nagano').click(); await sleep(600);
    const wantNagano = expSnow(data.filter((r) => r.region === 'Nagano'));
    check('a region filter narrows the candidates: top 10 within Nagano', same(names(), wantNagano), { got: names(), want: wantNagano });
    chip('#region-chips', 'Nagano').click(); await sleep(300);
    check('removing the region restores the national list', same(names(), want), names());

    // -- turning it off
    chip('#ranking-chips', 'Snowiest').click(); await sleep(400);
    check('toggling off hides the ranking box and shows region groups again', !rankBoxVisible() && groupsVisible() > 0);
    check('toggling off removes rank badges and puts rows back in their groups', rows().every((r) => r.rank === null && r.inGroup), rows().slice(0, 3));
    check('status returns to the normal line', /^Showing/.test(status()), status());

    // -- altitude
    await clearAll();
    chip('#ranking-chips', 'Highest').click(); await sleep(400);
    const wantAlt = expAlt(data);
    check('altitude: lists exactly the expected top 10', same(names(), wantAlt), { got: names(), want: wantAlt });
    const noElev = data.filter((r) => !r.elevation_top_m).length;
    check('altitude: status counts resorts with no known elevation', new RegExp(noElev + ' have no known elevation').test(status()), { noElev, status: status() });

    // -- altitude in Typical season ranks only the resorts that have a curve
    season(); await sleep(500);
    const wantAltSeason = expAlt(data.filter((r) => r.typical_season_cm));
    check('typical season: altitude ranks only resorts with a typical-season curve', same(names(), wantAltSeason), { got: names(), want: wantAltSeason });
    check('typical season: Snowiest is disabled', chip('#ranking-chips', 'Snowiest').disabled);
    check('typical season: Highest altitude stays on', chip('#ranking-chips', 'Highest').classList.contains('is-active'));
    const liveOnlyCount = data.length - data.filter((r) => r.typical_season_cm).length;
    check('typical season: ranking status still explains why live-only resorts are excluded',
      new RegExp(liveOnlyCount + ' live-only resorts are hidden in Typical season mode').test(status()), status());

    // Several filter/ranking/mode transitions have happened by this point -
    // exactly the history that used to leave marker DOM order scrambled.
    checkMarkerOrder('after several filter/ranking/mode transitions');

    // -- switching the ranking, then leaving Live mode ends a snow ranking
    live(); await sleep(300);
    chip('#ranking-chips', 'Snowiest').click(); await sleep(500);
    check('switching from altitude to snow works (already fetched, so instant)', same(names(), want), names());
    check('and only one ranking is active at a time', chip('#ranking-chips', 'Highest').getAttribute('aria-pressed') === 'false');
    season(); await sleep(400);
    check('leaving Live mode ends a snow ranking', !chip('#ranking-chips', 'Snowiest').classList.contains('is-active') && !rankBoxVisible());

    // -- Clear filters ends a ranking
    live(); await sleep(300);
    chip('#ranking-chips', 'Highest').click(); await sleep(300);
    check('a ranking is on before clearing', rankBoxVisible());
    $('#clear-filters').click(); await sleep(400);
    check('Clear filters ends the ranking', !rankBoxVisible() && !chip('#ranking-chips', 'Highest').classList.contains('is-active'));
  }

  if(scenario === 'failure'){
    live(); await sleep(400);
    chip('#ranking-chips', 'Snowiest').click();
    check('the ranking settles despite a failed batch', await settle(), status());
    await sleep(200);
    const rs = rows();
    check('a ranking is still shown', rs.length > 0 && rankBoxVisible(), rs.length);
    check('status warns that live values are missing for the failed batch (100 resorts)', /live values are missing for 100 resorts/.test(status()), status());
    check('header says the data is only partly live', /PARTLY LIVE/.test($('#fetch-meta').textContent), $('#fetch-meta').textContent);
    const depths = rs.map((r) => parseFloat(r.live));
    check('rows are still ordered deepest first', depths.every((d, i) => i === 0 || d <= depths[i - 1]), depths);
    check('no zero-depth resort is ranked', depths.every((d) => d > 0), depths);
  }

  if(scenario === 'off-season'){
    live(); await sleep(400);
    chip('#ranking-chips', 'Snowiest').click();
    check('the snow ranking settles', await settle(), status());
    await sleep(200);
    check('says there is no snow, in words', status() === 'No resort has snow on the ground right now.', status());
    check('lists nothing and shows no empty ranking heading', rows().length === 0 && !rankBoxVisible(), rows().length);
    chip('#ranking-chips', 'Highest').click(); await sleep(400);
    check('altitude still works with no snow anywhere', same(names(), expAlt(data)), names());
  }

  const failures = results.filter((r) => !r.ok);
  return { scenario, passed: results.length - failures.length, failed: failures.length, failures };
})()
