'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// assets/app.js only exports anything when `typeof document === 'undefined'`
// (see the guard near the top of that file) — that's what makes this
// require() safe to do outside a browser at all.
const app = require('../../assets/app.js');

test('hexToRgb parses a 6-digit hex color', () => {
  assert.deepEqual(app.hexToRgb('#2f83e0'), [47, 131, 224]);
});

test('hexToRgb expands a 3-digit hex color', () => {
  assert.deepEqual(app.hexToRgb('#fff'), [255, 255, 255]);
});

test('lerpColor at t=0 returns the first color exactly', () => {
  assert.equal(app.lerpColor('#2f83e0', '#8f8f85', 0), 'rgb(47,131,224)');
});

test('lerpColor at t=1 returns the second color exactly', () => {
  assert.equal(app.lerpColor('#2f83e0', '#8f8f85', 1), 'rgb(143,143,133)');
});

test('lerpColor at t=0.5 is the rounded midpoint', () => {
  assert.equal(app.lerpColor('#000000', '#ffffff', 0.5), 'rgb(128,128,128)');
});

// The three colors below are the app's real dark-mode --temp-cold/mid/warm
// tokens, and every expected rgb() string here is a value hand-verified via
// the browser console earlier in the project — this locks those in.
const COLD = '#2f83e0', MID = '#8f8f85', WARM = '#e2793f';

test('tempToColor at the coldest edge of the domain returns the cold color exactly', () => {
  assert.equal(app.tempToColor(-16, COLD, MID, WARM), 'rgb(47,131,224)');
});

test('tempToColor at freezing returns the neutral midpoint color exactly', () => {
  assert.equal(app.tempToColor(0, COLD, MID, WARM), 'rgb(143,143,133)');
});

test('tempToColor at the warmest edge of the domain returns the warm color exactly', () => {
  assert.equal(app.tempToColor(20, COLD, MID, WARM), 'rgb(226,121,63)');
});

test('tempToColor clamps past the domain rather than extrapolating', () => {
  assert.equal(app.tempToColor(-40, COLD, MID, WARM), app.tempToColor(-16, COLD, MID, WARM));
  assert.equal(app.tempToColor(40, COLD, MID, WARM), app.tempToColor(20, COLD, MID, WARM));
});

test('tempToColor at -8C matches the exact value this stayed at after the squared-easing fix', () => {
  // -8C is the linear midpoint between -16 and 0, but the squared easing
  // keeps it closer to the cold pole than a straight 50/50 blend would —
  // this is the exact contrast-fix regression test.
  assert.equal(app.tempToColor(-8, COLD, MID, WARM), 'rgb(71,134,201)');
});

test('depthToRadius floors at 60% of the minimum radius for 0cm', () => {
  assert.equal(app.depthToRadius(0), 6.5 * 0.6);
});

test('depthToRadius treats anything at or under the hollow-ring threshold as zero', () => {
  assert.equal(app.depthToRadius(0.05), 6.5 * 0.6);
});

test('depthToRadius scales area (not radius) with depth: 4x depth is 2x the radius above the floor', () => {
  const floor = 6.5;
  const r1 = app.depthToRadius(50);
  const r2 = app.depthToRadius(200);
  assert.ok(Math.abs((r2 - floor) / (r1 - floor) - 2) < 1e-9);
});

test('depthToRadius reaches the maximum radius at the domain ceiling', () => {
  assert.equal(app.depthToRadius(300), 15);
});

test('depthToRadius clamps above the domain ceiling rather than growing further', () => {
  assert.equal(app.depthToRadius(1000), app.depthToRadius(300));
});

test('fmtDate formats an ISO date as a short month and day', () => {
  assert.equal(app.fmtDate('2026-02-14'), 'Feb 14');
});

test('fmtFetched prints the Open-Meteo wall-clock time as-is, with no time zone name', () => {
  assert.equal(app.fmtFetched('2026-02-14T21:45'), 'Feb 14, 9:45 PM');
  assert.doesNotMatch(app.fmtFetched('2026-02-14T21:45'), /GMT|UTC|JST/);
});

// Regression tests for GitHub issue #1: the map hover tooltip could render
// past the bottom (or side) of the viewport, since it always placed itself
// below-and-right of the cursor with no check for whether that fit.
test('computeTooltipPosition places the tooltip below and right of the cursor when there is room', () => {
  const pos = app.computeTooltipPosition(300, 400, 220, 99, 1200, 900, 14);
  assert.deepEqual(pos, { x: 314, y: 414 });
});

test('computeTooltipPosition flips above the cursor when the default position would overflow the bottom', () => {
  // viewport is only 450 tall; cursor at y=400 + 99 tall tooltip + 14 margin
  // would end at 513, past the bottom, so it should flip above instead
  const pos = app.computeTooltipPosition(300, 400, 220, 99, 1200, 450, 14);
  assert.equal(pos.y, 400 - 99 - 14);
  assert.ok(pos.y + 99 <= 450, 'flipped tooltip should fit within the viewport height');
});

test('computeTooltipPosition flips left of the cursor when the default position would overflow the right edge', () => {
  const pos = app.computeTooltipPosition(1100, 400, 220, 99, 1200, 900, 14);
  assert.equal(pos.x, 1100 - 220 - 14);
  assert.ok(pos.x + 220 <= 1200, 'flipped tooltip should fit within the viewport width');
});

test('computeTooltipPosition clamps to a small margin when the viewport is too small to fit the tooltip on either side', () => {
  // a 110x50 viewport is smaller than the 220x99 tooltip in both dimensions,
  // so both the default position and the flipped position overflow — it
  // should clamp to a small positive margin rather than go negative
  const pos = app.computeTooltipPosition(5, 5, 220, 99, 110, 50, 14);
  assert.deepEqual(pos, { x: 4, y: 4 });
});

// ---- resort filtering / visibility ----
// Fixtures: a resort with a typical-season curve (curved) and one without
// (live-only), across tiers and regions.
const CURVE = [['2026-02-14', 100]];
const R = {
  niseko: { id: 'niseko', name: 'Niseko United', region: 'Hokkaido', prefecture: 'Hokkaido', tier: 'major', typical_season_cm: CURVE },
  happo: { id: 'happo', name: 'Hakuba Happo-one', region: 'Nagano', prefecture: 'Nagano', tier: 'major', typical_season_cm: CURVE },
  goryu: { id: 'goryu', name: 'Hakuba Goryu', region: 'Nagano', prefecture: 'Nagano', tier: 'medium' },
  tiny: { id: 'tiny', name: 'Tiny Hill', region: 'Chubu', prefecture: 'Gifu', tier: 'small' },
};
const ALL_TIERS = ['major', 'medium', 'small'];
const ctx = (over) => Object.assign({ mode: 'live', zoom: 5, regions: [], tiers: ALL_TIERS, query: '', selectedId: null }, over);

test('hasCurve is true only for a resort with a non-empty typical-season curve', () => {
  assert.equal(app.hasCurve(R.niseko), true);
  assert.equal(app.hasCurve(R.goryu), false);
  assert.equal(app.hasCurve({ typical_season_cm: [] }), false);
});

test('fmtElevation shows metres, or a dash when the elevation is unknown', () => {
  assert.equal(app.fmtElevation({ elevation_top_m: 1308 }), '1308m');
  assert.equal(app.fmtElevation({ elevation_top_m: null }), '—');
  assert.equal(app.fmtElevation({}), '—');
});

test('escapeHtml escapes markup so a resort name cannot inject HTML', () => {
  assert.equal(app.escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(app.escapeHtml('Niseko United'), 'Niseko United');
});

test('isTierRevealed: major always, medium and small from their zoom thresholds', () => {
  const { medium, small } = app.TIER_MIN_ZOOM;
  assert.equal(app.isTierRevealed('major', 0), true);
  assert.equal(app.isTierRevealed('medium', medium - 1), false);
  assert.equal(app.isTierRevealed('medium', medium), true);
  assert.equal(app.isTierRevealed('small', small - 1), false);
  assert.equal(app.isTierRevealed('small', small), true);
});

test('isTierRevealed treats an unknown tier like the smallest one', () => {
  assert.equal(app.isTierRevealed('mystery', app.TIER_MIN_ZOOM.small - 1), false);
  assert.equal(app.isTierRevealed('mystery', app.TIER_MIN_ZOOM.small), true);
});

test('matchesQuery matches name, prefecture and region case-insensitively, and everything when empty', () => {
  assert.equal(app.matchesQuery(R.happo, 'HAKUBA'), true);
  assert.equal(app.matchesQuery(R.tiny, 'gifu'), true);
  assert.equal(app.matchesQuery(R.tiny, 'chubu'), true);
  assert.equal(app.matchesQuery(R.tiny, 'hakuba'), false);
  assert.equal(app.matchesQuery(R.tiny, ''), true);
  assert.equal(app.matchesQuery(R.tiny, '   '), true);
});

test('matchesQuery tolerates a resort with no prefecture', () => {
  assert.equal(app.matchesQuery({ name: 'X', region: 'Nagano' }, 'nagano'), true);
  assert.equal(app.matchesQuery({ name: 'X', region: 'Nagano' }, 'gifu'), false);
});

test('passesFilters combines region, tier and search', () => {
  assert.equal(app.passesFilters(R.happo, ctx({ regions: ['Nagano'] })), true);
  assert.equal(app.passesFilters(R.niseko, ctx({ regions: ['Nagano'] })), false);
  assert.equal(app.passesFilters(R.goryu, ctx({ tiers: ['major'] })), false);
  assert.equal(app.passesFilters(R.happo, ctx({ query: 'goryu' })), false);
  assert.equal(app.passesFilters(R.happo, ctx()), true);
});

test('isEligible: live mode shows everything, season mode only resorts with a curve', () => {
  assert.equal(app.isEligible(R.goryu, 'live'), true);
  assert.equal(app.isEligible(R.goryu, 'season'), false);
  assert.equal(app.isEligible(R.niseko, 'season'), true);
});

test('classifyResort: a live-only resort is hidden in season mode whatever else is true', () => {
  assert.equal(app.classifyResort(R.goryu, ctx({ mode: 'season', zoom: 12 })), 'hidden');
  assert.equal(app.classifyResort(R.goryu, ctx({ mode: 'season', zoom: 12, selectedId: 'goryu' })), 'hidden');
});

test('classifyResort: smaller tiers stay hidden until their reveal zoom', () => {
  const { medium, small } = app.TIER_MIN_ZOOM;
  assert.equal(app.classifyResort(R.goryu, ctx({ zoom: medium - 1 })), 'hidden');
  assert.equal(app.classifyResort(R.goryu, ctx({ zoom: medium })), 'active');
  assert.equal(app.classifyResort(R.tiny, ctx({ zoom: small - 1 })), 'hidden');
  assert.equal(app.classifyResort(R.tiny, ctx({ zoom: small })), 'active');
});

test('classifyResort: a revealed resort the filters exclude is dimmed, not hidden', () => {
  assert.equal(app.classifyResort(R.niseko, ctx({ regions: ['Nagano'] })), 'dim');
});

test('classifyResort: a resort below its reveal zoom stays hidden even when filtered out (no swarm of dim dots)', () => {
  assert.equal(app.classifyResort(R.tiny, ctx({ zoom: 5, regions: ['Nagano'] })), 'hidden');
});

test('classifyResort: a search match is revealed at any zoom, non-matches follow the normal rules', () => {
  assert.equal(app.classifyResort(R.goryu, ctx({ zoom: 3, query: 'goryu' })), 'active');
  assert.equal(app.classifyResort(R.tiny, ctx({ zoom: 3, query: 'goryu' })), 'hidden');
  assert.equal(app.classifyResort(R.niseko, ctx({ zoom: 3, query: 'goryu' })), 'dim');
});

test('classifyResort: the selected resort stays active even when the filters exclude it', () => {
  assert.equal(app.classifyResort(R.niseko, ctx({ regions: ['Nagano'], selectedId: 'niseko' })), 'active');
});

test('classifyResort: a tier filter turns a revealed resort into a dim dot', () => {
  assert.equal(app.classifyResort(R.goryu, ctx({ zoom: 8, tiers: ['major'] })), 'dim');
});

test('isListed follows the map view, but a search match is listed wherever it is', () => {
  assert.equal(app.isListed('active', true, false, true, true), true);
  assert.equal(app.isListed('active', true, false, false, true), false);
  assert.equal(app.isListed('active', true, true, false, true), true, 'search match outside the view');
  assert.equal(app.isListed('active', true, false, false, false), true, 'map-view limit switched off');
});

test('isListed never lists a dim or hidden resort', () => {
  assert.equal(app.isListed('dim', true, true, true, false), false);
  assert.equal(app.isListed('hidden', true, true, true, false), false);
});

test('isListed does not list the selected resort when the filters exclude it, though it stays on the map', () => {
  assert.equal(app.isListed('active', false, true, true, true), false);
});

test('REGION_ORDER lists the seven regions north to south', () => {
  // test/region_consistency_test.rb checks this list against the Ruby
  // importer's, the CSS colour tokens, and the regions in data/resorts.json.
  assert.deepEqual(app.REGION_ORDER, ['Hokkaido', 'Tohoku', 'Kanto', 'Niigata', 'Nagano', 'Chubu', 'Western Japan']);
});

// sortResorts is the one order shared by the resort list and the map
// markers' DOM order (so keyboard Tab order matches the list) - see the
// "Keyboard Tab order" fix in docs/CHANGELOG.md.
const sr = (id, region, run) => ({ id, name: id, region, run_km: run });

test('sortResorts groups by REGION_ORDER, largest run_km first within a region', () => {
  const input = [sr('a', 'Nagano', 5), sr('b', 'Hokkaido', 1), sr('c', 'Nagano', 20), sr('d', 'Hokkaido', 50)];
  const sorted = app.sortResorts(input).map((r) => r.id);
  assert.deepEqual(sorted, ['d', 'b', 'c', 'a']);
});

test('sortResorts treats a missing run_km as 0, not as sorting last unpredictably', () => {
  const input = [sr('a', 'Hokkaido', undefined), sr('b', 'Hokkaido', 5)];
  assert.deepEqual(app.sortResorts(input).map((r) => r.id), ['b', 'a']);
});

test('sortResorts does not mutate its input array', () => {
  const input = [sr('a', 'Nagano', 1), sr('b', 'Hokkaido', 1)];
  const before = input.map((r) => r.id);
  app.sortResorts(input);
  assert.deepEqual(input.map((r) => r.id), before);
});

test('sortResorts is stable: equal region and run_km keep their original relative order', () => {
  const input = [sr('a', 'Hokkaido', 10), sr('b', 'Hokkaido', 10), sr('c', 'Hokkaido', 10)];
  assert.deepEqual(app.sortResorts(input).map((r) => r.id), ['a', 'b', 'c']);
});

// ---- Top-10 rankings ----
const rk = (id, snow, elev, run) => ({ id, name: id, region: 'Nagano', prefecture: 'Nagano', tier: 'small',
  snow_depth_cm: snow, elevation_top_m: elev, run_km: run || 0 });

test('rankResorts (snow) orders by depth, deepest first', () => {
  const list = [rk('a', 10, 1000), rk('b', 80, 1000), rk('c', 45, 1000)];
  assert.deepEqual(app.rankResorts(list, 'snow', 10), ['b', 'c', 'a']);
});

test('rankResorts keeps only the top n', () => {
  const list = Array.from({ length: 15 }, (_, i) => rk('r' + i, 10 + i, 1000));
  const top = app.rankResorts(list, 'snow', 10);
  assert.equal(top.length, 10);
  assert.equal(top[0], 'r14');
  assert.equal(top[9], 'r5');
});

test('rankResorts (snow) leaves out resorts with 0 cm, so an off-season list is empty rather than ten ties on zero', () => {
  assert.deepEqual(app.rankResorts([rk('a', 0, 1000), rk('b', 0, 2000)], 'snow', 10), []);
  assert.deepEqual(app.rankResorts([rk('a', 0, 1000), rk('b', 12, 500)], 'snow', 10), ['b']);
});

test('rankResorts ignores resorts with a missing or non-numeric value', () => {
  const list = [rk('a', null, 1000), rk('b', undefined, 1000), rk('c', NaN, 1000), rk('d', 5, 1000)];
  assert.deepEqual(app.rankResorts(list, 'snow', 10), ['d']);
  const noElev = [rk('a', 1, null), rk('b', 1, undefined), rk('c', 1, 1500)];
  assert.deepEqual(app.rankResorts(noElev, 'altitude', 10), ['c']);
});

test('rankResorts (snow) breaks a depth tie by elevation, then by id, so the list is stable', () => {
  const list = [rk('low', 40, 900), rk('high', 40, 1800), rk('mid_b', 40, 1200), rk('mid_a', 40, 1200)];
  assert.deepEqual(app.rankResorts(list, 'snow', 10), ['high', 'mid_a', 'mid_b', 'low']);
});

test('rankResorts (snow) applies the tie-break at the cutoff, so the 10th place is deterministic', () => {
  const list = [rk('a', 50, 1000), rk('b', 40, 900), rk('c', 40, 1900), rk('d', 40, 1400)];
  assert.deepEqual(app.rankResorts(list, 'snow', 3), ['a', 'c', 'd']);
});

test('rankResorts (altitude) orders by top elevation, breaking ties by run length', () => {
  const list = [rk('a', 0, 2000, 5), rk('b', 0, 2300, 1), rk('c', 0, 2000, 30)];
  assert.deepEqual(app.rankResorts(list, 'altitude', 10), ['b', 'c', 'a']);
});

test('rankResorts (altitude) ranks a resort with no snow at all', () => {
  assert.deepEqual(app.rankResorts([rk('a', 0, 1500), rk('b', 0, 2500)], 'altitude', 10), ['b', 'a']);
});

test('rankResorts returns nothing for an unknown ranking, and does not reorder its input', () => {
  const list = [rk('a', 10, 1000), rk('b', 80, 2000)];
  const before = list.map((r) => r.id);
  assert.deepEqual(app.rankResorts(list, 'mystery', 10), []);
  app.rankResorts(list, 'snow', 10);
  assert.deepEqual(list.map((r) => r.id), before);
});

test('isRankingReady: altitude is always ready, snow waits until every candidate has been looked at', () => {
  const c = [rk('a', 1, 1), rk('b', 1, 1)];
  assert.equal(app.isRankingReady('altitude', c, {}), true);
  assert.equal(app.isRankingReady('snow', c, {}), false);
  assert.equal(app.isRankingReady('snow', c, { a: true }), false);
  assert.equal(app.isRankingReady('snow', c, { a: true, b: true }), true);
  assert.equal(app.isRankingReady('snow', [], {}), true);
});

test('passesFilters with a Top-10 list admits only its members (and an empty list admits nobody)', () => {
  const a = rk('a', 1, 1), b = rk('b', 1, 1);
  assert.equal(app.passesFilters(a, ctx({ rankedIds: ['a'] })), true);
  assert.equal(app.passesFilters(b, ctx({ rankedIds: ['a'] })), false);
  assert.equal(app.passesFilters(b, ctx({ rankedIds: null })), true);
  assert.equal(app.passesFilters(a, ctx({ rankedIds: [] })), false);
});

test('classifyResort: a Top-10 member is revealed at any zoom, even a small resort at the country-wide view', () => {
  assert.equal(app.classifyResort(R.tiny, ctx({ zoom: 3, rankedIds: ['tiny'] })), 'active');
});

test('classifyResort: with a Top-10 list active, non-members are dimmed if revealed and hidden if not', () => {
  assert.equal(app.classifyResort(R.niseko, ctx({ zoom: 5, rankedIds: ['tiny'] })), 'dim');
  assert.equal(app.classifyResort(R.goryu, ctx({ zoom: 5, rankedIds: ['tiny'] })), 'hidden');
});

test('classifyResort: an empty Top-10 list (no snow anywhere) dims everything but keeps the selected resort', () => {
  assert.equal(app.classifyResort(R.niseko, ctx({ rankedIds: [] })), 'dim');
  assert.equal(app.classifyResort(R.niseko, ctx({ rankedIds: [], selectedId: 'niseko' })), 'active');
});

test('isListed lists a Top-10 member outside the map view when the flag says it is listed anywhere', () => {
  assert.equal(app.isListed('active', true, true, false, true), true);
  assert.equal(app.isListed('active', true, false, false, true), false);
});

// fetchMetaLabel: the header's fetch-status label. Mode-aware since
// "LIVE DATA FETCHED" used to show regardless of mode - see the fix in
// docs/CHANGELOG.md.
test('fetchMetaLabel: Typical season always reads as a snapshot, regardless of live-fetch outcome', () => {
  assert.equal(app.fetchMetaLabel('season', true), 'TYPICAL SEASON SHOWN');
  assert.equal(app.fetchMetaLabel('season', false), 'TYPICAL SEASON SHOWN');
  assert.equal(app.fetchMetaLabel('season', 'partial'), 'TYPICAL SEASON SHOWN');
});

test('fetchMetaLabel: Live mode reflects the live-fetch outcome', () => {
  assert.equal(app.fetchMetaLabel('live', true), 'LIVE DATA FETCHED');
  assert.equal(app.fetchMetaLabel('live', false), 'SNAPSHOT (LIVE REFRESH FAILED)');
  assert.equal(app.fetchMetaLabel('live', 'partial'), 'PARTLY LIVE (SOME REFRESHES FAILED)');
});

test('weatherInfo separates light, normal and heavy snow and rain by level', () => {
  assert.deepEqual([71, 73, 75].map((c) => app.weatherInfo(c).level), [1, 2, 3]);
  assert.deepEqual([61, 63, 65].map((c) => app.weatherInfo(c).level), [1, 2, 3]);
  assert.equal(app.weatherInfo(75).kind, 'snow');
  assert.equal(app.weatherInfo(65).kind, 'rain');
  assert.equal(app.weatherInfo(75).label, 'Heavy snow');
});

test('weatherInfo gives sun, cloud, fog and thunder no intensity level', () => {
  [0, 3, 45, 95].forEach((c) => assert.equal(app.weatherInfo(c).level, 0));
});

test('weatherInfo falls back to an unknown kind for unmapped codes', () => {
  assert.equal(app.weatherInfo(1234).kind, 'unknown');
});

test('forecastIconSvg draws one cloud per precipitation level', () => {
  const clouds = (code) => (app.forecastIconSvg(app.weatherInfo(code)).match(/wx-cloud/g) || []).length;
  assert.equal(clouds(71), 1);
  assert.equal(clouds(73), 2);
  assert.equal(clouds(75), 3);
  assert.equal(clouds(65), 3);
  assert.equal(clouds(3), 1);
  assert.equal(clouds(0), 0);
});

test('forecastIconSvg uses flakes for snow and drops for rain', () => {
  assert.match(app.forecastIconSvg(app.weatherInfo(73)), /wx-dot/);
  assert.doesNotMatch(app.forecastIconSvg(app.weatherInfo(73)), /M8\.5 19\.6/);
  assert.match(app.forecastIconSvg(app.weatherInfo(63)), /M8\.5 19\.6/);
});

test('snowBarPct scales against the given max, with a visible minimum', () => {
  assert.equal(app.snowBarPct(0, 25), 0);
  assert.equal(app.snowBarPct(12.5, 25), 50);
  assert.equal(app.snowBarPct(0.1, 25), 6);
  assert.equal(app.snowBarPct(40, 25), 100);
});

test('describeForecastDay lists conditions, temps and only mentions snow when there is some', () => {
  const day = { date: '2026-02-14', tMax: -2.6, tMin: -8.4, snow: 11.04, code: 73 };
  assert.equal(app.describeForecastDay(day), 'Sat 14: Snow, high -3°, low -8°, 11.0 cm new snow');
  assert.equal(app.describeForecastDay({ date: '2026-02-14', tMax: 1, tMin: -4, snow: 0, code: 0 }),
    'Sat 14: Clear, high 1°, low -4°');
});

test('every weather code Open-Meteo documents maps to a known kind', () => {
  const documented = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
    71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  documented.forEach((c) => assert.notEqual(app.weatherInfo(c).kind, 'unknown', 'code ' + c));
});

test('snow and rain codes always carry a level of 1 to 3, other kinds level 0', () => {
  [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].forEach((c) => {
    const { kind, level } = app.weatherInfo(c);
    if (kind === 'snow' || kind === 'rain') assert.ok(level >= 1 && level <= 3, 'code ' + c);
    else assert.equal(level, 0, 'code ' + c);
  });
});

test('heavier snow is never a lower level than lighter snow', () => {
  assert.ok(app.weatherInfo(86).level > app.weatherInfo(85).level);
  assert.ok(app.weatherInfo(82).level >= app.weatherInfo(81).level);
  assert.ok(app.weatherInfo(81).level >= app.weatherInfo(80).level);
});

test('forecastIconSvg for an unknown code is an empty, decorative svg', () => {
  const svg = app.forecastIconSvg(app.weatherInfo(1234));
  assert.match(svg, /^<svg[^>]*aria-hidden="true"[^>]*><\/svg>$/);
});

test('the three-cloud stack has two clouds below, the right one lower, and one on top', () => {
  const svg = app.forecastIconSvg(app.weatherInfo(75));
  const pos = [...svg.matchAll(/translate\((\d+),(\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.equal(pos.length, 3);
  const [left, right, top] = pos;
  assert.ok(right[1] > left[1], 'right cloud sits lower than the left one');
  assert.ok(top[1] < left[1], 'top cloud is above both');
  assert.ok(top[0] > left[0] && top[0] < right[0], 'top cloud is centred between them');
});

test('every precipitation mark is drawn with a halo behind it', () => {
  const svg = app.forecastIconSvg(app.weatherInfo(73));
  assert.equal((svg.match(/wx-halo-dot/g) || []).length, (svg.match(/class="wx-dot"/g) || []).length);
});

test('snowBarPct treats missing, negative and NaN amounts as no bar', () => {
  [undefined, null, NaN, -3].forEach((v) => assert.equal(app.snowBarPct(v, 25), 0));
});

test('fmtTemp rounds, shows a dash for a missing value, and never prints -0', () => {
  assert.equal(app.fmtTemp(-2.6), '-3°');
  assert.equal(app.fmtTemp(4.4), '4°');
  assert.equal(app.fmtTemp(-0.4), '0°');
  assert.equal(app.fmtTemp(null), '—');
  assert.equal(app.fmtTemp(undefined), '—');
});

test('fmtDay stays unambiguous across a month boundary', () => {
  assert.equal(app.fmtDay('2026-02-28'), 'Sat 28');
  assert.equal(app.fmtDay('2026-03-01'), 'Sun Mar 1');
});

test('parseForecast turns Open-Meteo parallel arrays into one object per day', () => {
  const days = app.parseForecast({ daily: {
    time: ['2026-02-14', '2026-02-15'], temperature_2m_max: [-2, 1], temperature_2m_min: [-8, -4],
    snowfall_sum: [11.04, 0], weather_code: [73, 0] } });
  assert.deepEqual(days, [
    { date: '2026-02-14', tMax: -2, tMin: -8, snow: 11.04, code: 73 },
    { date: '2026-02-15', tMax: 1, tMin: -4, snow: 0, code: 0 },
  ]);
});

test('parseForecast turns a null snowfall into 0 but keeps null temperatures', () => {
  const [day] = app.parseForecast({ daily: {
    time: ['2026-02-14'], temperature_2m_max: [null], temperature_2m_min: [null],
    snowfall_sum: [null], weather_code: [3] } });
  assert.equal(day.snow, 0);
  assert.equal(day.tMax, null);
});

test('parseForecast rejects a response with no daily block', () => {
  assert.throws(() => app.parseForecast({}), /unexpected forecast shape/);
  assert.throws(() => app.parseForecast(null), /unexpected forecast shape/);
  assert.throws(() => app.parseForecast({ daily: { time: 'x' } }), /unexpected forecast shape/);
});

test('describeForecastDay says a missing temperature is missing, not zero', () => {
  assert.equal(app.describeForecastDay({ date: '2026-02-14', tMax: null, tMin: -4, snow: 0, code: 3 }),
    'Sat 14: Overcast, high —, low -4°');
});

test('fmtDayParts splits weekday from date, and adds the month only on the 1st', () => {
  assert.deepEqual(app.fmtDayParts('2026-02-14'), { weekday: 'Sat', date: '14' });
  assert.deepEqual(app.fmtDayParts('2026-10-01'), { weekday: 'Thu', date: 'Oct 1' });
});
