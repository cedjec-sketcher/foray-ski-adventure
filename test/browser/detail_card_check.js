// Browser check for the detail card's structure: the three time frames (what
// is labelled live, illustrative or forecast), the forecast summary and
// legend, the dry-week layout, and the "jump to the card" pill. Run it in the
// normal page (http://localhost:8000/); like forecast_check.js it stubs
// window.fetch for Open-Meteo's `daily=` requests itself.
//
// From a console or the browser tool:
//   await (0, eval)(await (await fetch('/test/browser/detail_card_check.js')).text())
// It resolves to { passed, failed, failures }. Best run with the browser
// window shorter than the page (the pill needs the card below the fold).
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
  const preselected = document.getElementById('d-name').textContent;
  const [A, B, C] = ['Niseko United', 'Rusutsu', 'Furano', 'Kiroro'].filter((n) => n !== preselected).map(byName);
  const liveOnly = data.find((r) => !(r.typical_season_cm && r.typical_season_cm.length));

  let snowy = true;
  const realFetch = window.fetch;
  window.fetch = function(url){
    if(String(url).indexOf('daily=') === -1) return realFetch.apply(this, arguments);
    return Promise.resolve(new Response(JSON.stringify({ daily: {
      time: ['2026-02-12', '2026-02-13', '2026-02-14', '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18'],
      temperature_2m_max: [-3, -2, -2, 1, 0, 4, 5], temperature_2m_min: [-9, -8, -7, -11, -7, -1, 1],
      snowfall_sum: snowy ? [24, 11, 3, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0],
      weather_code: [75, 73, 71, 0, 3, 61, 65] } }), { status: 200 }));
  };

  const $ = (sel) => document.querySelector(sel);
  const text = (sel) => ($(sel) ? $(sel).textContent : null);
  const pick = (r) => { document.querySelector('button[aria-label^="' + r.name + '"]').click(); };
  const days = () => document.querySelectorAll('#forecast-body .fc-day').length;
  const inView = (el) => { const b = el.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; };

  try {
    // 1. Typical season view: labelled illustrative, typical peak shown.
    $('#mode-season').click(); await sleep(150);
    pick(A); await waitFor(() => days() === 7);
    check('season view labels the block as illustrative and dated',
      /^Typical season/.test(text('#d-cond-label')) && /illustrative/.test(text('#d-cond-label')) && /Feb 14/.test(text('#d-cond-label')), text('#d-cond-label'));
    check('season view shows the typical peak', !$('#d-peak-stat').hidden && /cm/.test(text('#d-peak')));
    check('the forecast has its own dated heading', /Next 7 days/.test(document.querySelector('.forecast .section-label').textContent));
    check('conditions and forecast are separate blocks', document.querySelectorAll('.detail-block').length === 2);
    check('elevation and runs are outside the conditions block', !$('.detail-block').contains($('#d-elev')));

    // 2. Live view: labelled live, no illustrative peak.
    $('#mode-live').click(); await sleep(200);
    check('live view is labelled "Live now"', text('#d-cond-label') === 'Live now', text('#d-cond-label'));
    check('live view hides the illustrative typical peak', $('#d-peak-stat').hidden);

    // 3. A live-only resort: live label, no peak, and the explanatory note.
    const search = $('#resort-search');
    search.value = liveOnly.name; search.dispatchEvent(new Event('input', { bubbles: true })); await sleep(300);
    pick(liveOnly); await waitFor(() => text('#d-name') === liveOnly.name);
    check('a live-only resort says "Live now"', text('#d-cond-label') === 'Live now', text('#d-cond-label'));
    check('a live-only resort hides the typical peak and shows the note', $('#d-peak-stat').hidden && !$('#d-nocurve').hidden);
    search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); await sleep(200);
    $('#mode-season').click(); await sleep(200);

    // 4. Snowy week: summary, bars and legend.
    pick(B); await waitFor(() => days() === 7);
    check('a snowy week states the total', text('.fc-summary') === '38 cm new snow expected', text('.fc-summary'));
    check('a snowy week draws bars and amounts', document.querySelectorAll('.fc-bar').length === 3 && document.querySelectorAll('.fc-cm').length === 7);
    check('the legend explains cloud count and the bar scale',
      /More clouds means heavier/.test(text('.fc-legend')) && /full height = 25 cm/.test(text('.fc-legend')), text('.fc-legend'));

    // 5. Dry week: one plain line, no empty bar band.
    snowy = false;
    pick(C); await waitFor(() => /No new snow/.test(text('.fc-summary') || ''));
    check('a dry week says no new snow is expected', text('.fc-summary') === 'No new snow expected', text('.fc-summary'));
    check('a dry week has no bar band or amounts', !$('.fc-bars') && !$('.fc-cm') && $('.forecast-strip').classList.contains('is-dry'));
    check('a dry week legend does not mention bars', !/Bar height/.test(text('.fc-legend')), text('.fc-legend'));

    // 6. Selecting announces itself to screen readers.
    check('selecting a resort announces it', /Furano/.test(text('#d-announce')) || text('#d-announce').includes(C.name), text('#d-announce'));

    // 7. The pill: shown while the card is off screen, gone once it is on screen.
    window.scrollTo(0, 0);
    await waitFor(() => !inView($('#detail-card')));
    const cardOff = !inView($('#detail-card'));
    if(cardOff){
      await waitFor(() => !$('#detail-pill').hidden);
      check('the pill appears while the card is off screen and names the resort',
        !$('#detail-pill').hidden && $('#detail-pill').textContent.includes(C.name) && /↓/.test($('#detail-pill').textContent), $('#detail-pill').textContent);
      $('#detail-pill').click();
      await waitFor(() => inView($('#detail-card')), 3000);
      await sleep(500);
      check('clicking the pill brings the card into view', inView($('#detail-card')));
      check('clicking the pill moves focus to the card', document.activeElement === $('#detail-card'));
      check('the pill hides once the card is on screen', await waitFor(() => $('#detail-pill').hidden));
    } else {
      check('(skipped pill checks: the window is tall enough to show the card)', true);
    }
  } catch(e) {
    check('check script ran to the end', false, String(e && e.stack || e));
  } finally {
    window.fetch = realFetch;
  }

  const failures = results.filter((r) => !r.ok);
  return { passed: results.length - failures.length, failed: failures.length, failures };
})();
