// Browser check for the detail card's 7-day forecast: fetching, caching, the
// stale-response guard, and the failure states. Run it in the normal page
// (http://localhost:8000/, no debug hooks needed) - it stubs window.fetch for
// Open-Meteo's `daily=` requests itself, so no network and no real forecast.
//
// From a console or the browser tool:
//   await (0, eval)(await (await fetch('/test/browser/forecast_check.js')).text())
// It resolves to { passed, failed, failures }.
(async function(){
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail: ok ? undefined : detail });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, ms = 4000){
    const t0 = Date.now();
    while(Date.now() - t0 < ms){ if(fn()) return true; await sleep(30); }
    return false;
  }

  const data = JSON.parse(document.getElementById('ski-data').textContent).resorts;
  const byName = (n) => data.find((r) => r.name === n);
  // The page opens with one resort already selected and its real forecast
  // already fetched (before this script can stub anything), so that one is
  // left out: every resort used below starts with nothing cached.
  const preselected = document.getElementById('d-name').textContent;
  const [A, B, C, D, E, F, G] = ['Niseko United', 'Rusutsu', 'Furano', 'Kiroro', 'Sahoro', 'Tomamu Ski Resort',
    'Asahidake', 'Sapporo Teine'].filter((n) => n !== preselected).map(byName);

  // One stub for every `daily=` request. A resort's forecast is recognised by
  // its latitude, and its max temperature is set to tag(resort) so the
  // test can tell whose forecast is on screen.
  const tag = (r) => Math.round(r.lat * 100); // unique per resort (Furano and Kiroro both round to 43 degrees)
  const calls = [];
  let plan = {}; // resort id -> { delay, fail, status, nulls }
  const realFetch = window.fetch;
  window.fetch = function(url, opts){
    if(String(url).indexOf('daily=') === -1) return realFetch.apply(this, arguments);
    const lat = Number(new URL(url).searchParams.get('latitude'));
    const r = data.find((x) => x.lat === lat);
    calls.push(r.id);
    const p = plan[r.id] || {};
    return new Promise((resolve, reject) => setTimeout(() => {
      if(p.fail) return reject(new TypeError('network down'));
      if(p.status) return resolve(new Response('{}', { status: p.status }));
      const t = tag(r);
      resolve(new Response(JSON.stringify({ daily: {
        time: ['2026-02-12', '2026-02-13', '2026-02-14', '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18'],
        temperature_2m_max: p.nulls ? [null, null, null, null, null, null, null] : [t, t, t, t, t, t, t],
        temperature_2m_min: p.nulls ? [null, null, null, null, null, null, null] : [t - 6, t - 6, t - 6, t - 6, t - 6, t - 6, t - 6],
        snowfall_sum: [24, 11, 3, 0, 0, 0, 0], weather_code: [75, 73, 71, 0, 3, 61, 65] } }), { status: 200 }));
    }, p.delay || 10));
  };

  const $ = (sel) => document.querySelector(sel);
  const body = () => $('#forecast-body');
  const days = () => [...document.querySelectorAll('#forecast-body .fc-day')];
  const firstHi = () => (days()[0] && days()[0].querySelector('.fc-hi').textContent) || null;
  const pick = (r) => { document.querySelector('button[aria-label^="' + r.name + '"]').click(); };
  const callsFor = (r) => calls.filter((id) => id === r.id).length;

  try {
    // 1. First selection fetches once and renders seven columns.
    pick(A);
    check('shows a loading state before the response lands', /Loading forecast/.test(body().textContent), body().textContent);
    await waitFor(() => days().length === 7);
    check('renders seven day columns', days().length === 7, days().length);
    check('first day shows that resort\'s max temperature', firstHi() === tag(A) + '°', firstHi());
    check('a heavy-snow day draws three clouds', days()[0].querySelectorAll('.wx-cloud').length === 3, days()[0].querySelectorAll('.wx-cloud').length);
    check('a clear day draws no clouds', days()[3].querySelectorAll('.wx-cloud').length === 0, days()[3].querySelectorAll('.wx-cloud').length);
    check('each day has a screen-reader description and a tooltip',
      days().every((d) => d.querySelector('.sr-only').textContent.length > 10 && d.title === d.querySelector('.sr-only').textContent));
    check('the visible column is hidden from screen readers', days().every((d) => d.querySelector('.fc-col').getAttribute('aria-hidden') === 'true'));
    check('the snow bar is tallest for the snowiest day',
      (() => { const h = days().map((d) => { const b = d.querySelector('.fc-bar'); return b ? parseFloat(b.style.height) : 0; }); return h[0] > h[1] && h[1] > h[2] && h[3] === 0; })());
    check('one request for the first resort', callsFor(A) === 1, callsFor(A));

    // 2. Re-renders for the same resort don't refetch or rebuild the strip.
    const strip = $('#forecast-body .forecast-strip');
    $('#mode-live').click(); await sleep(150);
    $('#mode-season').click(); await sleep(150);
    const slider = $('#date-slider'); slider.value = 10; slider.dispatchEvent(new Event('input', { bubbles: true })); await sleep(150);
    check('mode toggles and the slider do not refetch', callsFor(A) === 1, callsFor(A));
    check('mode toggles and the slider do not rebuild the strip', $('#forecast-body .forecast-strip') === strip);

    // 3. A different resort fetches; coming back to the first one is cached.
    pick(B);
    await waitFor(() => firstHi() === tag(B) + '°');
    check('a second resort shows its own forecast', firstHi() === tag(B) + '°', firstHi());
    pick(A); await sleep(100);
    check('returning to a resort shows its forecast again', firstHi() === tag(A) + '°', firstHi());
    check('returning to a resort does not refetch', callsFor(A) === 1, callsFor(A));

    // 4. A slow response for an earlier selection must not overwrite a later one.
    plan[C.id] = { delay: 500 };
    plan[D.id] = { delay: 20 };
    pick(C); await sleep(30); pick(D);
    await waitFor(() => firstHi() === tag(D) + '°');
    await sleep(700);
    check('a stale slow response does not overwrite the newer selection', firstHi() === tag(D) + '°', firstHi());
    check('...but it is still cached for later', (pick(C), await waitFor(() => firstHi() === tag(C) + '°')) && callsFor(C) === 1, callsFor(C));

    // 5. Failure states, and recovery on the next resort.
    plan[E.id] = { fail: true };
    pick(E);
    await waitFor(() => /Forecast unavailable/.test(body().textContent));
    check('a network failure shows "Forecast unavailable"', /Forecast unavailable/.test(body().textContent), body().textContent);
    check('a failed forecast draws no columns', days().length === 0);
    pick(A); await sleep(100);
    check('the next resort still works after a failure', days().length === 7 && firstHi() === tag(A) + '°', firstHi());

    plan[F.id] = { status: 500 };
    pick(F);
    await waitFor(() => /Forecast unavailable/.test(body().textContent));
    check('an HTTP error shows "Forecast unavailable"', /Forecast unavailable/.test(body().textContent), body().textContent);

    // 6. Missing temperatures show a dash, not 0°.
    plan[G.id] = { nulls: true };
    pick(G);
    await waitFor(() => days().length === 7);
    check('null temperatures show a dash rather than 0°', firstHi() === '—', firstHi());
  } catch(e) {
    check('check script ran to the end', false, String(e && e.stack || e));
  } finally {
    window.fetch = realFetch;
  }

  const failures = results.filter((r) => !r.ok);
  return { passed: results.length - failures.length, failed: failures.length, failures };
})();
