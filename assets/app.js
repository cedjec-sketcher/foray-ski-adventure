(function(){
  "use strict";

  // ---- pure config + helpers ----
  // Nothing below this point touches the DOM, so it's safe for a Node test
  // to require() this file directly (see the module.exports guard at the
  // bottom). Everything that does touch the DOM/Leaflet/fetch lives inside
  // the `typeof document !== 'undefined'` guard further down, which a
  // require() in Node skips entirely.
  var REGION_ORDER = ["Hokkaido","Tohoku","Kanto","Niigata","Nagano","Chubu","Western Japan"];
  var REGION_VAR = {Hokkaido:"--hokkaido", Tohoku:"--tohoku", Kanto:"--kanto", Niigata:"--niigata",
    Nagano:"--nagano", Chubu:"--chubu", "Western Japan":"--west"};
  // Size tiers (assigned at import time from downhill run length; see
  // lib/openskimap_import.rb) and the map zoom at which each becomes visible.
  // Major resorts are always shown; smaller ones appear as you zoom in, so
  // ~450 markers never pile up on the country-wide view.
  var TIER_ORDER = ["major","medium","small"];
  var TIER_MIN_ZOOM = { major: 0, medium: 6, small: 8 };
  // "Top N" lists: which measure ranks, and how many places it shows.
  var TOP_N = 10;
  var RANKINGS = ["altitude","snow"];

  // The one fixed resort order used for BOTH the list (grouped by region
  // under REGION_ORDER headings) and the map markers' DOM order (so Tab
  // order on the map follows the same order a sighted user reads the list
  // in, rather than data/resorts.json's raw storage order). Computed once;
  // never re-sorted at runtime, so it stays a stable Tab order regardless
  // of which markers happen to be active/dim/hidden right now.
  function sortResorts(resorts){
    return resorts.slice().sort(function(a, b){
      var ra = REGION_ORDER.indexOf(a.region), rb = REGION_ORDER.indexOf(b.region);
      if(ra !== rb) return ra - rb;
      return (b.run_km || 0) - (a.run_km || 0);
    });
  }
  var MAX_PEAK = 320; // fixed y-domain so charts are comparable across resorts (Hakkoda tops out near 300)
  var DEPTH_DOMAIN = 300; // marker area scale domain
  var TEMP_COLD = -16, TEMP_MID = 0, TEMP_WARM = 20;
  var R_MIN = 6.5, R_MAX = 15;

  function hexToRgb(hex){
    hex = hex.replace('#','');
    if(hex.length===3){ hex = hex.split('').map(function(c){return c+c;}).join(''); }
    var num = parseInt(hex,16);
    return [(num>>16)&255, (num>>8)&255, num&255];
  }
  function lerpColor(c1, c2, t){
    var a = hexToRgb(c1), b = hexToRgb(c2);
    var r = Math.round(a[0]+(b[0]-a[0])*t);
    var g = Math.round(a[1]+(b[1]-a[1])*t);
    var bl = Math.round(a[2]+(b[2]-a[2])*t);
    return "rgb("+r+","+g+","+bl+")";
  }
  // coldHex/midHex/warmHex are passed in (rather than read from CSS custom
  // properties internally) specifically so this stays callable with no DOM
  // at all — the one call site below supplies the live theme colors via
  // cssVar(), a test supplies literal hex strings.
  function tempToColor(t, coldHex, midHex, warmHex){
    // squared easing keeps hues saturated away from the pole and reserves
    // the neutral midpoint for values genuinely close to freezing
    if(t <= TEMP_MID){
      var t1 = Math.max(0, Math.min(1, (t - TEMP_COLD) / (TEMP_MID - TEMP_COLD)));
      return lerpColor(coldHex, midHex, t1*t1);
    } else {
      var t2 = Math.max(0, Math.min(1, (t - TEMP_MID) / (TEMP_WARM - TEMP_MID)));
      return lerpColor(midHex, warmHex, t2*t2);
    }
  }
  function depthToRadius(depth){
    if(depth <= 0.05) return R_MIN * 0.6;
    var v = Math.max(0, Math.min(DEPTH_DOMAIN, depth));
    return R_MIN + Math.sqrt(v/DEPTH_DOMAIN) * (R_MAX - R_MIN);
  }

  function fmtDate(iso){
    var d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", {month:"short", day:"numeric"});
  }
  function fmtFetched(iso){
    var d = new Date(iso.replace(" ","T"));
    return d.toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit", timeZoneName:"short"});
  }

  // Only larger resorts have a typical-season pattern (see
  // data/illustrative_curve_tuning.json); the rest are live-only.
  function hasCurve(r){
    return Array.isArray(r.typical_season_cm) && r.typical_season_cm.length > 0;
  }

  function fmtElevation(r){
    return r.elevation_top_m ? r.elevation_top_m + "m" : "—";
  }

  // Resort names come from a third-party dataset and end up in innerHTML
  // (the map tooltip), so they're escaped rather than trusted.
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  function isTierRevealed(tier, zoom){
    var min = TIER_MIN_ZOOM.hasOwnProperty(tier) ? TIER_MIN_ZOOM[tier] : TIER_MIN_ZOOM.small;
    return zoom >= min;
  }

  // Case-insensitive substring match on name, prefecture and region, so
  // "gifu", "hakuba" and "tohoku" all find what you'd expect.
  function matchesQuery(r, query){
    var q = (query || "").trim().toLowerCase();
    if(q === "") return true;
    return [r.name, r.prefecture, r.region].some(function(field){
      return field && String(field).toLowerCase().indexOf(q) !== -1;
    });
  }

  function rankValue(r, ranking){
    var v = ranking === "snow" ? r.snow_depth_cm : r.elevation_top_m;
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  // Ids of the top n resorts by the chosen measure, best first. A resort with
  // no value, or a value of 0, isn't ranked: an off-season "snowiest" list is
  // empty rather than ten resorts tied on 0 cm. The weather model gives
  // neighbouring resorts identical depths often, so ties are real and are
  // broken deterministically: by elevation for snow (higher is colder), by
  // downhill run length for altitude, then by id.
  function rankResorts(resorts, ranking, n){
    if(RANKINGS.indexOf(ranking) === -1) return [];
    return resorts
      .filter(function(r){ var v = rankValue(r, ranking); return v !== null && v > 0; })
      .sort(function(a, b){
        var d = rankValue(b, ranking) - rankValue(a, ranking);
        if(d) return d;
        var t = ranking === "snow"
          ? (b.elevation_top_m || 0) - (a.elevation_top_m || 0)
          : (b.run_km || 0) - (a.run_km || 0);
        if(t) return t;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      })
      .slice(0, n)
      .map(function(r){ return r.id; });
  }

  // Altitude is static data, so it can always be ranked. Snow depth is only
  // trustworthy once every candidate has been refreshed live (or given up
  // on): ranking off a mix of fresh values and an old snapshot would show a
  // list that then reshuffles as batches arrive. liveDone: { id: true }.
  function isRankingReady(ranking, candidates, liveDone){
    if(ranking !== "snow") return true;
    return candidates.every(function(r){ return liveDone[r.id]; });
  }

  // ctx: { regions: [] (empty = all), tiers: [enabled tier names], query,
  //        rankedIds: null, or the ids in the active Top-N list }
  function passesFilters(r, ctx){
    return (ctx.regions.length === 0 || ctx.regions.indexOf(r.region) !== -1) &&
      ctx.tiers.indexOf(r.tier) !== -1 &&
      matchesQuery(r, ctx.query) &&
      (!ctx.rankedIds || ctx.rankedIds.indexOf(r.id) !== -1);
  }

  // Whether the resort has anything to show in the current mode at all.
  function isEligible(r, mode){
    return mode === "live" || hasCurve(r);
  }

  // The header's fetch-status label. Mode-aware: "LIVE DATA FETCHED" used to
  // show regardless of mode, in the most prominent line at the top of the
  // page, above the banner explaining Typical season is a snapshot - easy to
  // skim as "what I'm looking at is live" when it isn't (UX review). The
  // live-fetch outcome only matters to what's on screen when mode is live.
  function fetchMetaLabel(mode, liveFetchOk){
    if(mode !== "live") return "TYPICAL SEASON SHOWN";
    if(liveFetchOk === false) return "SNAPSHOT (LIVE REFRESH FAILED)";
    if(liveFetchOk === "partial") return "PARTLY LIVE (SOME REFRESHES FAILED)";
    return "LIVE DATA FETCHED";
  }

  // How a resort should appear on the map right now:
  //   'active' - a normal marker (and a row in the list)
  //   'dim'    - filtered out, but drawn as a faint dot so you keep the
  //              geography (only for resorts that would otherwise be showing)
  //   'hidden' - not drawn
  // ctx: { mode, zoom, regions, tiers, query, selectedId, rankedIds }
  function classifyResort(r, ctx){
    if(!isEligible(r, ctx.mode)) return "hidden";
    if(r.id === ctx.selectedId) return "active";
    var searching = (ctx.query || "").trim() !== "";
    var matches = matchesQuery(r, ctx.query);
    // A search match is always revealed, whatever the zoom: finding a small
    // resort by name shouldn't require already knowing where to zoom.
    // Likewise a resort in the active Top-N list: those are the point of it.
    var ranked = !!ctx.rankedIds && ctx.rankedIds.indexOf(r.id) !== -1;
    var revealed = isTierRevealed(r.tier, ctx.zoom) || (searching && matches) || ranked;
    if(!revealed) return "hidden";
    return passesFilters(r, ctx) ? "active" : "dim";
  }

  // The list follows the map (only resorts in view), except that a search
  // match or a resort in the Top-N list (`listedAnywhere`) is listed wherever
  // it is - clicking it then pans the map there.
  // `passes` is separate from cls because the selected resort is always
  // drawn 'active' (so you don't lose it on the map) even if the filters
  // exclude it, but it shouldn't get a list row the filters say shouldn't exist.
  function isListed(cls, passes, listedAnywhere, inView, mapOnly){
    return cls === "active" && passes && (!mapOnly || inView || listedAnywhere);
  }

  // Default: below and to the right of the cursor. Flips to the other side
  // of the cursor on whichever axis would otherwise push the tooltip past
  // the viewport edge (a marker near the bottom of the map used to send the
  // tooltip straight past the map card into whatever came after it — GitHub
  // issue #1).
  function computeTooltipPosition(cursorX, cursorY, tipWidth, tipHeight, viewportWidth, viewportHeight, margin){
    var x = cursorX + margin;
    var y = cursorY + margin;
    if(y + tipHeight > viewportHeight) y = cursorY - tipHeight - margin;
    if(x + tipWidth > viewportWidth) x = cursorX - tipWidth - margin;
    x = Math.max(4, x);
    y = Math.max(4, y);
    return { x: x, y: y };
  }

  if (typeof document !== 'undefined') {
  // ---- everything below touches the DOM, Leaflet, or fetch ----
  var DATA = JSON.parse(document.getElementById('ski-data').textContent);
  var DATES = DATA.resorts.filter(hasCurve)[0].typical_season_cm.map(function(p){ return p[0]; });
  var PEAK_INDEX = 25; // mid-Feb, index into the 3-day-step curve arrays

  var state = {
    mode: 'season', dayIndex: PEAK_INDEX, selectedId: null,
    regions: [],                 // empty = every region
    tiers: TIER_ORDER.slice(),   // enabled size tiers
    query: '',
    mapOnly: true,               // list only what's in the map view
    ranking: null                // null, 'altitude' or 'snow' (Live mode only): show only the top 10
  };

  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function regionColor(region){ return cssVar(REGION_VAR[region] || "--accent"); }

  function getDisplay(r){
    // A live-only resort has no typical-season numbers, so it always shows
    // its live ones (the map hides it in season mode, but the detail card
    // can still be showing it).
    if(state.mode === 'live' || !hasCurve(r)){
      return { depth: r.snow_depth_cm, temp: r.temperature_c, label: 'Live now' };
    }
    var d = r.typical_season_cm[state.dayIndex][1];
    var t = r.typical_season_temp_c[state.dayIndex][1];
    var lbl = fmtDate(DATES[state.dayIndex]) + (state.dayIndex===PEAK_INDEX ? ' (typical peak)' : '');
    return { depth: d, temp: t, label: lbl };
  }

  // ---- header meta ----
  function updateFetchMeta(){
    document.getElementById('fetch-meta').innerHTML =
      fetchMetaLabel(state.mode, DATA.live_fetch_ok) + "<br>" + fmtFetched(DATA.generated_at) +
      ' JST<br>source: <a href="https://open-meteo.com/">open-meteo.com</a>';
  }
  updateFetchMeta();

  // ---- live client-side refresh ----
  // The page renders instantly from the snapshot baked in at build time
  // (above); this fetches current conditions directly from Open-Meteo and
  // upgrades the in-memory data in place once it resolves. Falls back to the
  // snapshot for anything that fails (offline, rate limit, API hiccup).
  //
  // Only resorts actually on screen are refreshed, in batches, and each at
  // most once per page view. Open-Meteo's free tier allows 600 calls/minute,
  // 5,000/hour and 10,000/day per IP, but doesn't document whether one
  // request for 100 locations counts as 1 call or 100. So this is written for
  // the worse case: refreshing all ~480 on every load could let a few reloads
  // hit the limit if each location counts. Failed batches are not retried
  // within a page view, for the same reason.
  var LIVE_BATCH = 100;
  var liveDone = {};      // id -> true once refreshed (or given up on)
  var liveInFlight = {};  // id -> true while a request covering it is pending
  var liveOk = 0, liveFailed = 0;
  var liveFailedIds = {}; // id -> true when its batch failed (it keeps the snapshot value)

  function refreshLiveConditions(resorts){
    var todo = resorts.filter(function(r){ return !liveDone[r.id] && !liveInFlight[r.id]; });
    for(var i = 0; i < todo.length; i += LIVE_BATCH){
      fetchLiveBatch(todo.slice(i, i + LIVE_BATCH));
    }
  }

  function fetchLiveBatch(batch){
    batch.forEach(function(r){ liveInFlight[r.id] = true; });
    var lats = batch.map(function(r){ return r.lat; }).join(",");
    var lons = batch.map(function(r){ return r.lon; }).join(",");
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lats + "&longitude=" + lons +
      "&current=snow_depth,temperature_2m,weather_code&timezone=Asia%2FTokyo";
    fetch(url).then(function(res){
      if(!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function(live){
      // Open-Meteo answers a single location with a bare object, not an array.
      if(!Array.isArray(live)) live = [live];
      if(live.length !== batch.length) throw new Error("unexpected response shape");
      var fetchedAt = null;
      batch.forEach(function(r, i){
        var cur = live[i].current;
        r.snow_depth_cm = Math.round(cur.snow_depth * 1000) / 10;
        r.temperature_c = cur.temperature_2m;
        r.weather_code = cur.weather_code;
        fetchedAt = cur.time;
      });
      liveOk += batch.length;
      DATA.generated_at = fetchedAt;
      DATA.live_fetch_ok = liveFailed ? 'partial' : true;
      finishLiveBatch(batch, true);
    }).catch(function(err){
      liveFailed += batch.length;
      batch.forEach(function(r){ liveFailedIds[r.id] = true; });
      DATA.live_fetch_ok = liveOk ? 'partial' : false;
      console.warn("Live conditions fetch failed, showing last-built snapshot for " + batch.length + " resorts:", err);
      finishLiveBatch(batch, false);
    });
  }

  function finishLiveBatch(batch, ok){
    batch.forEach(function(r){ delete liveInFlight[r.id]; liveDone[r.id] = true; });
    updateFetchMeta();
    // A failure changes nothing on screen by itself, but a Top-10 ranking
    // waiting on this batch needs to re-check whether it's now ready.
    if(state.mode === 'live') refreshAll();
  }

  // What to refresh: normally only resorts that are drawn and in (or just
  // beyond) the viewport. A snow ranking is the exception: "the snowiest 10"
  // is only true if every candidate has been looked at, wherever it is, so
  // it fetches them all (still once each, still in batches of 100).
  function liveTargets(){
    if(state.ranking === 'snow') return rankingCandidates();
    var area = map.getBounds().pad(0.25);
    return DATA.resorts.filter(function(r){
      return classes[r.id] === 'active' && area.contains([r.lat, r.lon]);
    });
  }

  // Debounced: called after every map/list refresh, but only fires once the
  // view has settled.
  var liveTimer = null;
  function scheduleLiveRefresh(){
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function(){ refreshLiveConditions(liveTargets()); }, 350);
  }

  // ---- map ----
  var svgNS = "http://www.w3.org/2000/svg"; // still used by the chart and size-legend SVGs below

  // scrollWheelZoom is off deliberately: a map embedded in a scrolling page
  // that captures the mouse wheel fights the page scroll the moment the
  // cursor happens to be over it. The zoom buttons, double-click, and touch
  // pinch-zoom (Leaflet defaults) all still work.
  var map = L.map('map', { scrollWheelZoom: false });
  // The opening view frames the major resorts only. Framing all ~480 would
  // zoom out to take in Kyushu and Shikoku, shrinking the area where nearly
  // all the major resorts are.
  var MAJOR_BOUNDS = L.latLngBounds(DATA.resorts.filter(function(r){ return r.tier === 'major'; })
    .map(function(r){ return [r.lat, r.lon]; }));
  function fitOverview(){ map.fitBounds(MAJOR_BOUNDS, { padding: [28, 28] }); }
  fitOverview();

  // A single tile source (plain OpenStreetMap, no API key ever required) kept
  // for both themes; dark mode is a CSS filter on the tile layer rather than a
  // second tile provider, since free "dark" tile services have a habit of
  // adding API-key requirements later without much notice.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' +
      ' &middot; resorts: <a href="https://openskimap.org">OpenSkiMap</a>',
    maxZoom: 18
  }).addTo(map);

  function isDarkMode(){
    var explicit = document.documentElement.getAttribute('data-theme');
    if(explicit === 'dark') return true;
    if(explicit === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyMapTheme(){
    document.getElementById('map').classList.toggle('map-dark', isDarkMode());
  }
  applyMapTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyMapTheme);

  // Markers are added to / removed from this group as their class (see
  // classifyResort) changes, rather than all being on the map all the time.
  var markerLayer = L.layerGroup().addTo(map);
  var markerEls = {};
  var classes = {};       // id -> 'active' | 'dim' | 'hidden', from the last renderMarkers()
  // The list's own order (region, then size), reused for the markers' DOM
  // order too, so keyboard Tab order over the map follows the same order a
  // sighted user reads the list in - see renderMarkers()'s bulk restacking.
  var SORTED_RESORTS = sortResorts(DATA.resorts);
  SORTED_RESORTS.forEach(function(r){
    var m = L.circleMarker([r.lat, r.lon], { className: 'marker' });
    m.on('click', function(){ select(r.id); });
    m.on('mouseover', function(e){ showMapTip(e.originalEvent, r); });
    m.on('mousemove', function(e){ showMapTip(e.originalEvent, r); });
    m.on('mouseout', hideMapTip);
    markerEls[r.id] = m;
  });

  // Leaflet's SVG renderer gives each circle marker a real DOM element, so it
  // can be made keyboard-operable. That element is recreated every time the
  // marker is re-added to the map, so this runs after each add, not once.
  function wireMarkerElement(m, r){
    var el = m.getElement();
    if(!el || el._skiWired) return el;
    el._skiWired = true;
    el.setAttribute('role', 'button');
    el.addEventListener('keydown', function(e){
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(r.id); }
    });
    return el;
  }

  var mapTip = document.getElementById('map-tooltip');
  function showMapTip(e, r){
    var disp = getDisplay(r);
    mapTip.innerHTML = "<b>" + escapeHtml(r.name) + "</b>" + escapeHtml(r.region) + " &middot; " + fmtElevation(r) + " top" +
      "<br>" + disp.label + ": " + Math.round(disp.depth) + "cm, " + disp.temp.toFixed(1) + "&deg;C" +
      (hasCurve(r) ? "<br>Typical peak: " + r.typical_peak_cm + "cm" : "<br>Live data only");

    var tipRect = mapTip.getBoundingClientRect(); // opacity:0 still lays out, so this reflects real content size
    var pos = computeTooltipPosition(e.clientX, e.clientY, tipRect.width, tipRect.height, window.innerWidth, window.innerHeight, 14);

    mapTip.style.left = pos.x + "px";
    mapTip.style.top = pos.y + "px";
    mapTip.classList.add('visible');
  }
  function hideMapTip(){ mapTip.classList.remove('visible'); }

  // The context without the Top-10 restriction: what decides which resorts
  // are *candidates* for a ranking.
  function baseCtx(){
    return { mode: state.mode, zoom: map.getZoom(), regions: state.regions, tiers: state.tiers,
      query: state.query, selectedId: state.selectedId, rankedIds: null };
  }
  function currentCtx(){
    var ctx = baseCtx();
    ctx.rankedIds = rankState.ids;
    return ctx;
  }

  // Top-10 list, recomputed on every refresh from the candidates (resorts
  // that pass the other filters): ids is null when no ranking is active or
  // while a snow ranking is still waiting for live data.
  var rankState = { ids: null, pending: false, candidates: [] };
  function rankingCandidates(){
    var ctx = baseCtx();
    return DATA.resorts.filter(function(r){ return isEligible(r, ctx.mode) && passesFilters(r, ctx); });
  }
  function computeRanking(){
    rankState = { ids: null, pending: false, candidates: [] };
    if(!state.ranking) return;
    if(state.ranking === 'snow' && state.mode !== 'live') return; // no snow ranking on made-up numbers
    var candidates = rankingCandidates();
    rankState.candidates = candidates;
    if(!isRankingReady(state.ranking, candidates, liveDone)){ rankState.pending = true; return; }
    rankState.ids = rankResorts(candidates, state.ranking, TOP_N);
  }

  // Set by renderMarkers(), read by renderStatus(): how many resorts pass the
  // filters but are held back only because their size tier isn't revealed yet.
  var zoomHeldBack = 0;

  function renderMarkers(){
    var ctx = currentCtx();
    var cold = cssVar('--temp-cold'), mid = cssVar('--temp-mid'), warm = cssVar('--temp-warm');
    var surface = cssVar('--surface'), faint = cssVar('--ink-3');
    zoomHeldBack = 0;
    var dimOnes = [], activeOnes = []; // built in SORTED_RESORTS order, restacked at the end

    SORTED_RESORTS.forEach(function(r){
      var m = markerEls[r.id];
      var cls = classifyResort(r, ctx);
      classes[r.id] = cls;

      if(cls === 'hidden'){
        if(markerLayer.hasLayer(m)) markerLayer.removeLayer(m);
        if(isEligible(r, ctx.mode) && passesFilters(r, ctx)) zoomHeldBack++;
        return;
      }
      if(!markerLayer.hasLayer(m)) markerLayer.addLayer(m);
      var el = wireMarkerElement(m, r);

      if(cls === 'dim'){
        m.setStyle({ radius: 3, color: faint, weight: 1, opacity: 0.55, fillColor: faint, fillOpacity: 0.4 });
        if(el){
          el.classList.add('marker-dim');
          el.removeAttribute('tabindex');
          el.setAttribute('aria-hidden', 'true');
          el.removeAttribute('aria-label');
        }
        dimOnes.push(m);
        return;
      }

      var disp = getDisplay(r);
      var radius = depthToRadius(disp.depth);
      var color = tempToColor(disp.temp, cold, mid, warm);
      if(disp.depth <= 0.05){
        m.setStyle({ radius: radius, color: color, weight: 2.2, opacity: 1, fillOpacity: 0 });
      } else {
        m.setStyle({ radius: radius, color: surface, weight: 1.6, opacity: 1, fillColor: color, fillOpacity: 1 });
      }
      if(el){
        el.classList.remove('marker-dim');
        el.setAttribute('tabindex', '0');
        el.removeAttribute('aria-hidden');
        el.setAttribute('aria-label', r.name + ", " + r.region + ", " + Math.round(disp.depth) + " centimeters, " + disp.temp.toFixed(0) + " degrees");
      }
      activeOnes.push(m);
    });

    // Faint dots are drawn under the real markers, and Tab order over the
    // map should be stable and meaningful (matching the list), not "whoever
    // most recently became active" - so every render restacks in one fixed
    // pass, dim markers first then active markers, both in SORTED_RESORTS
    // order, rather than lifting individual markers as they change.
    dimOnes.forEach(function(m){ m.bringToFront(); });
    activeOnes.forEach(function(m){ m.bringToFront(); });
  }

  // ---- size legend (uses the same depthToRadius scale as the map) ----
  function renderSizeLegend(){
    var svgEl = document.getElementById('size-legend');
    svgEl.innerHTML = '';
    var neutral = cssVar('--ink-3');
    var examples = [0, 50, 150, 300];
    var xs = [16, 54, 100, 156];

    // All circles share one center line (cy), so every label needs to clear
    // whichever example draws the biggest circle, not just its own — using
    // a fixed offset from cy meant for the smallest circle let the largest
    // one (300cm) grow right through its own label.
    var maxR = Math.max.apply(null, examples.map(depthToRadius));
    var topPad = 3, labelGap = 12, bottomPad = 4;
    var cy = topPad + maxR;
    var labelY = cy + maxR + labelGap;
    var totalHeight = labelY + bottomPad;
    svgEl.setAttribute('viewBox', '0 0 180 ' + totalHeight);
    svgEl.setAttribute('height', totalHeight);

    examples.forEach(function(v, i){
      var r = depthToRadius(v);
      var c = document.createElementNS(svgNS,'circle');
      c.setAttribute('cx', xs[i]); c.setAttribute('cy', cy); c.setAttribute('r', r);
      if(v === 0){ c.setAttribute('fill','none'); c.setAttribute('stroke', neutral); c.setAttribute('stroke-width', 1.8); }
      else { c.setAttribute('fill', neutral); }
      svgEl.appendChild(c);
      var lbl = document.createElementNS(svgNS,'text');
      lbl.setAttribute('x', xs[i]); lbl.setAttribute('y', labelY);
      lbl.setAttribute('text-anchor','middle');
      lbl.setAttribute('font-family','IBM Plex Mono, monospace');
      lbl.setAttribute('font-size','9');
      lbl.setAttribute('fill', neutral);
      lbl.textContent = v + 'cm';
      svgEl.appendChild(lbl);
    });
  }

  // ---- list ----
  // Every resort gets a row up front (~480 small nodes); which ones are
  // visible is decided by renderList() toggling `hidden`, so filtering never
  // rebuilds DOM.
  var listEl = document.getElementById('resort-list');
  var byRegion = {};
  // Same SORTED_RESORTS order the map markers use (region, then largest
  // first) - one shared order for both, rather than two sorts that could
  // silently drift apart.
  SORTED_RESORTS.forEach(function(r){ (byRegion[r.region] = byRegion[r.region]||[]).push(r); });
  var rowEls = {};
  var groupEls = {};
  var groupItems = {};   // region -> resorts in list order, to put rows back after a ranking

  // A Top-10 list is one flat, rank-ordered run of rows, which the
  // region-grouped layout can't express. So while a ranking is active its rows
  // are moved into this box, and moved back when it ends.
  var rankBox = document.createElement('div');
  rankBox.className = 'rank-group';
  rankBox.hidden = true;
  var rankHeading = document.createElement('div');
  rankHeading.className = 'region-heading';
  rankBox.appendChild(rankHeading);
  listEl.appendChild(rankBox);

  REGION_ORDER.forEach(function(region){
    var items = byRegion[region] || [];
    if(!items.length) return;
    var group = document.createElement('div');
    group.className = 'region-group';
    var heading = document.createElement('div');
    heading.className = 'region-heading';
    var dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = 'var(' + REGION_VAR[region] + ')';
    heading.appendChild(dot);
    heading.appendChild(document.createTextNode(region));
    var headCount = document.createElement('span');
    headCount.className = 'head-count';
    heading.appendChild(headCount);
    group.appendChild(heading);
    groupEls[region] = { root: group, count: headCount };
    groupItems[region] = items;
    items.forEach(function(r){
      var row = document.createElement('button');
      row.className = 'resort-row';
      row.type = 'button';
      row.addEventListener('click', function(){ selectFromList(r); });

      // Built once per resort; renderList() below only ever updates these
      // nodes' textContent, never rebuilds them, so resort data can't
      // break the row's markup no matter what it contains.
      var nameEl = document.createElement('span'); nameEl.className = 'name';
      var rankEl = document.createElement('span'); rankEl.className = 'rank'; rankEl.hidden = true;
      var nameTextEl = document.createElement('span'); nameTextEl.className = 'name-text';
      var liveEl = document.createElement('span'); liveEl.className = 'live';
      var peakEl = document.createElement('span'); peakEl.className = 'peak';
      var elevEl = document.createElement('span'); elevEl.className = 'elev';
      nameTextEl.textContent = r.name;
      nameEl.appendChild(rankEl);
      nameEl.appendChild(nameTextEl);
      row.appendChild(nameEl);
      row.appendChild(liveEl);
      row.appendChild(peakEl);
      row.appendChild(elevEl);

      group.appendChild(row);
      rowEls[r.id] = { root: row, live: liveEl, peak: peakEl, elev: elevEl, rank: rankEl };
    });
    listEl.appendChild(group);
  });

  var listedCount = 0;
  var placedRankKey = null; // the ranking currently laid out in rankBox, so unchanged rankings don't re-move rows (which would drop focus)

  function restoreRowsToGroups(){
    Object.keys(groupItems).forEach(function(region){
      groupItems[region].forEach(function(r){ groupEls[region].root.appendChild(rowEls[r.id].root); });
    });
    DATA.resorts.forEach(function(r){ rowEls[r.id].rank.hidden = true; });
  }

  function placeRankedRows(){
    var ids = rankState.ids;
    var key = ids ? state.ranking + ':' + ids.join(',') : null;
    if(key === placedRankKey) return;
    if(placedRankKey !== null) restoreRowsToGroups();
    placedRankKey = key;
    rankBox.hidden = !ids || ids.length === 0; // an empty list (no snow anywhere) says so in the status line, not with a bare heading
    if(!ids) return;
    ids.forEach(function(id, i){
      var refs = rowEls[id];
      refs.rank.textContent = i + 1;
      refs.rank.hidden = false;
      rankBox.appendChild(refs.root);
    });
  }

  function renderList(){
    var ctx = currentCtx();
    var inView = map.getBounds();
    var searching = state.query.trim() !== '';
    var perRegion = {};
    listedCount = 0;
    placeRankedRows();

    DATA.resorts.forEach(function(r){
      var refs = rowEls[r.id];
      var listedAnywhere = (searching && matchesQuery(r, state.query)) ||
        (!!ctx.rankedIds && ctx.rankedIds.indexOf(r.id) !== -1);
      var listed = isListed(classes[r.id], passesFilters(r, ctx), listedAnywhere, inView.contains([r.lat, r.lon]), state.mapOnly);
      refs.root.hidden = !listed;
      if(!listed) return;

      listedCount++;
      perRegion[r.region] = (perRegion[r.region] || 0) + 1;
      var disp = getDisplay(r);
      var whenLabel = (state.mode === 'live' || !hasCurve(r)) ? 'now' : fmtDate(DATES[state.dayIndex]);
      refs.live.textContent = Math.round(disp.depth) + 'cm ' + whenLabel;
      refs.peak.textContent = hasCurve(r) ? r.typical_peak_cm + 'cm peak' : '';
      var place = r.prefecture && r.prefecture !== r.region ? r.prefecture + ' · ' : '';
      refs.elev.textContent = place + fmtElevation(r) + ' · ' + disp.temp.toFixed(0) + '°C';

      // Without this, the row's accessible name falls back to its child
      // text nodes run together with no separators - unlike the marker's
      // own aria-label, which is already a clean, comma-separated sentence
      // (UX review). Rebuilt every render since depth/temp change with mode.
      var labelParts = [r.name, r.region, Math.round(disp.depth) + ' centimeters ' + whenLabel, disp.temp.toFixed(0) + ' degrees'];
      if(hasCurve(r)) labelParts.push('typical peak ' + r.typical_peak_cm + ' centimeters');
      if(r.elevation_top_m) labelParts.push(r.elevation_top_m + ' meters elevation');
      // placeRankedRows() (above) already set refs.rank for this render.
      if(!refs.rank.hidden) labelParts.push('ranked number ' + refs.rank.textContent);
      refs.root.setAttribute('aria-label', labelParts.join(', '));
    });

    Object.keys(groupEls).forEach(function(region){
      var n = perRegion[region] || 0;
      // With a ranking active every listed row lives in rankBox, so the
      // region groups are empty shells whatever the counts say.
      groupEls[region].root.hidden = n === 0 || !!ctx.rankedIds;
      groupEls[region].count.textContent = n ? ' · ' + n : '';
    });
    rankHeading.textContent = ctx.rankedIds ? rankTitle() : '';
  }

  // ---- filters: search, region chips, size chips, map-view toggle ----
  var searchEl = document.getElementById('resort-search');
  var regionChipsEl = document.getElementById('region-chips');
  var tierChipsEl = document.getElementById('tier-chips');
  var mapOnlyEl = document.getElementById('map-only');
  var clearEl = document.getElementById('clear-filters');
  var statusEl = document.getElementById('filter-status');
  var rankingChipsEl = document.getElementById('ranking-chips');
  var regionChips = {}, tierChips = {}, rankingChips = {};
  var pendingRankFit = false; // zoom to the new Top 10 once it can be computed

  var TIER_LABEL = { major: 'Major', medium: 'Medium', small: 'Small' };
  var TIER_HINT = {
    major: 'Major: 20+ km of downhill runs, plus every hand-picked resort. Always on the map, with a typical-season pattern.',
    medium: 'Medium: 8-20 km of runs. Appears on the map from zoom level ' + TIER_MIN_ZOOM.medium + '. Live data only.',
    small: 'Small: under 8 km of runs. Appears on the map from zoom level ' + TIER_MIN_ZOOM.small + '. Live data only.'
  };

  function makeChip(container, label, dotVar, onClick){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', 'false');
    if(dotVar){
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = 'var(' + dotVar + ')';
      b.appendChild(dot);
    }
    b.appendChild(document.createTextNode(label));
    var count = document.createElement('span');
    count.className = 'chip-count';
    b.appendChild(count);
    b.addEventListener('click', onClick);
    container.appendChild(b);
    return { root: b, count: count };
  }

  REGION_ORDER.forEach(function(region){
    regionChips[region] = makeChip(regionChipsEl, region, REGION_VAR[region], function(){ toggleRegion(region); });
  });
  TIER_ORDER.forEach(function(tier){
    tierChips[tier] = makeChip(tierChipsEl, TIER_LABEL[tier], null, function(){ toggleTier(tier); });
    tierChips[tier].root.title = TIER_HINT[tier];
  });

  var RANKING_LABEL = { altitude: 'Highest altitude', snow: 'Snowiest' };
  var RANKING_HINT = {
    altitude: 'The 10 resorts with the highest top elevation, among those matching the filters.',
    snow: 'The 10 resorts with the most snow on the ground right now, among those matching the filters.'
  };
  RANKINGS.forEach(function(kind){
    rankingChips[kind] = makeChip(rankingChipsEl, RANKING_LABEL[kind], null, function(){ toggleRanking(kind); });
  });

  function rankTitle(){
    return 'Top ' + TOP_N + (state.ranking === 'snow' ? ' snowiest now' : ' highest altitude');
  }

  function toggleRanking(kind){
    var next = state.ranking === kind ? null : kind;
    pendingRankFit = !!next;
    setState({ ranking: next });
  }

  // Once the Top 10 exists (a snow ranking has to wait for live data first),
  // show where it is.
  function maybeFitRanking(){
    if(!state.ranking){ pendingRankFit = false; return; }
    if(!pendingRankFit || rankState.ids === null) return;
    pendingRankFit = false;
    fitTo(DATA.resorts.filter(function(r){ return rankState.ids.indexOf(r.id) !== -1; }));
  }

  function resortsInRegions(regions){
    return DATA.resorts.filter(function(r){ return regions.indexOf(r.region) !== -1 && isEligible(r, state.mode); });
  }

  function fitTo(resorts){
    if(!resorts.length) return;
    map.fitBounds(L.latLngBounds(resorts.map(function(r){ return [r.lat, r.lon]; })), { padding: [28, 28], maxZoom: 10 });
  }

  function toggleRegion(region){
    var i = state.regions.indexOf(region);
    var next = state.regions.slice();
    if(i === -1) next.push(region); else next.splice(i, 1);
    setState({ regions: next });
    if(next.length) fitTo(resortsInRegions(next)); else fitOverview();
  }

  function toggleTier(tier){
    var i = state.tiers.indexOf(tier);
    var next = state.tiers.slice();
    if(i === -1) next.push(tier);
    else if(next.length > 1) next.splice(i, 1); // never leave the map with no size at all
    else return;
    setState({ tiers: next });
  }

  searchEl.addEventListener('input', function(){ setState({ query: searchEl.value }); });
  // Enter zooms the map to whatever the search matched.
  searchEl.addEventListener('keydown', function(e){
    if(e.key !== 'Enter') return;
    e.preventDefault();
    fitTo(DATA.resorts.filter(function(r){
      return isEligible(r, state.mode) && passesFilters(r, currentCtx());
    }));
  });
  mapOnlyEl.addEventListener('change', function(){ setState({ mapOnly: mapOnlyEl.checked }); });
  clearEl.addEventListener('click', function(){
    searchEl.value = '';
    pendingRankFit = false;
    setState({ regions: [], tiers: TIER_ORDER.slice(), query: '', ranking: null });
    fitOverview();
  });

  function filtersActive(){
    return state.regions.length > 0 || state.query.trim() !== '' || state.tiers.length < TIER_ORDER.length || !!state.ranking;
  }

  function renderFilters(){
    // Each chip's count reflects the OTHER active filters (tier/search for
    // a region chip, region/search for a tier chip), but never its own
    // dimension's current selection - a region chip says "how many are in
    // this region", not "how many more picking it would add". Previously
    // ignored tiers and search entirely, so e.g. typing a search term left
    // chip counts identical to the unfiltered totals (UX review).
    REGION_ORDER.forEach(function(region){
      var on = state.regions.indexOf(region) !== -1;
      regionChips[region].root.classList.toggle('is-active', on);
      regionChips[region].root.setAttribute('aria-pressed', on);
      regionChips[region].count.textContent = DATA.resorts.filter(function(r){
        return r.region === region && isEligible(r, state.mode) &&
          state.tiers.indexOf(r.tier) !== -1 && matchesQuery(r, state.query);
      }).length;
    });
    TIER_ORDER.forEach(function(tier){
      var on = state.tiers.indexOf(tier) !== -1;
      tierChips[tier].root.classList.toggle('is-active', on);
      tierChips[tier].root.setAttribute('aria-pressed', on);
      tierChips[tier].count.textContent = DATA.resorts.filter(function(r){
        return r.tier === tier && isEligible(r, state.mode) &&
          (state.regions.length === 0 || state.regions.indexOf(r.region) !== -1) && matchesQuery(r, state.query);
      }).length;
    });
    RANKINGS.forEach(function(kind){
      var on = state.ranking === kind;
      var blocked = kind === 'snow' && state.mode !== 'live';
      rankingChips[kind].root.classList.toggle('is-active', on);
      rankingChips[kind].root.setAttribute('aria-pressed', on);
      rankingChips[kind].root.disabled = blocked;
      rankingChips[kind].root.title = blocked ? 'Snowiest is only available in Live now mode: typical-season depths are illustrative, not measured.' : RANKING_HINT[kind];
    });
    clearEl.hidden = !filtersActive();
  }

  function rankingStatus(){
    var c = rankState.candidates, n = c.length;
    if(rankState.pending){
      var waiting = c.filter(function(r){ return !liveDone[r.id]; }).length;
      return 'Fetching live snow depth for ' + waiting + ' of ' + n + ' resorts\u2026';
    }
    var ids = rankState.ids || [];
    var parts = [];
    if(state.ranking === 'snow'){
      if(!ids.length) return 'No resort has snow on the ground right now.';
      parts.push(rankTitle() + ' of ' + n + ' resorts');
      if(ids.length < TOP_N) parts.push('only ' + ids.length + ' have any snow');
      parts.push('depth is modelled on a coarse grid, so neighbours can tie (the higher resort ranks first)');
      var missing = c.filter(function(r){ return liveFailedIds[r.id]; }).length;
      if(missing) parts.push('live values are missing for ' + missing + ' resorts, which use the last snapshot');
    } else {
      if(!ids.length) return 'No resort matches the filters.';
      parts.push(rankTitle() + ' of ' + n + ' resorts');
      var noElevation = c.filter(function(r){ return rankValue(r, 'altitude') === null; }).length;
      if(noElevation) parts.push(noElevation + ' have no known elevation and are not ranked');
    }
    // Same explanation the non-ranking status line gives for why the
    // candidate pool doesn't already include every resort. In practice this
    // only fires for altitude - a snow ranking only ever runs in Live mode,
    // where nothing is mode-excluded - but computed generically so it stays
    // correct if that changes.
    var liveOnly = DATA.resorts.length - DATA.resorts.filter(function(r){ return isEligible(r, state.mode); }).length;
    if(liveOnly > 0) parts.push(liveOnly + ' live-only resorts are hidden in Typical season mode; switch to Live now to see them');
    return parts.join(' \u00b7 ');
  }

  function renderStatus(){
    if(state.ranking){ statusEl.textContent = rankingStatus(); return; }
    var eligible = DATA.resorts.filter(function(r){ return isEligible(r, state.mode); }).length;
    var parts = ['Showing ' + listedCount + ' of ' + eligible + ' resorts'];
    if(zoomHeldBack > 0){
      parts.push(zoomHeldBack + ' smaller ' + (zoomHeldBack === 1 ? 'resort appears' : 'resorts appear') + ' as you zoom in');
    }
    var liveOnly = DATA.resorts.length - eligible;
    if(liveOnly > 0){
      parts.push(liveOnly + ' live-only resorts are hidden in Typical season mode; switch to Live now to see them');
    }
    statusEl.textContent = parts.join(' · ');
  }

  // ---- detail / chart ----
  var detailCard = document.getElementById('detail-card');
  var CHART_W = 640, CHART_H = 230, CHART_PAD_L = 34, CHART_PAD_R = 12, CHART_PAD_T = 14, CHART_PAD_B = 26;

  function buildDetailSkeleton(){
    detailCard.innerHTML =
      '<div class="detail-head">' +
        '<div>' +
          '<h1 class="detail-title" id="d-name"></h1>' +
          '<span class="badge" id="d-badge"><span class="dot"></span><span id="d-region"></span></span>' +
        '</div>' +
        '<div class="stat-row">' +
          '<div class="stat"><div class="k" id="d-snow-k">Snow</div><div class="v" id="d-live"></div></div>' +
          '<div class="stat"><div class="k" id="d-temp-k">Temp</div><div class="v" id="d-temp"></div></div>' +
          '<div class="stat"><div class="k">Typical peak</div><div class="v" id="d-peak"></div></div>' +
          '<div class="stat"><div class="k">Top elevation</div><div class="v" id="d-elev"></div></div>' +
          '<div class="stat" id="d-runs-stat"><div class="k">Downhill runs</div><div class="v" id="d-runs"></div></div>' +
        '</div>' +
      '</div>' +
      '<p class="detail-note" id="d-nocurve" hidden>Live conditions only. This resort has no typical-season pattern yet; those exist for the larger resorts.</p>' +
      '<div class="chart-wrap" style="position:relative;">' +
        '<svg id="chart-svg" class="chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + CHART_W + ' ' + CHART_H + '" role="img" aria-labelledby="chart-desc"></svg>' +
        '<div class="chart-tooltip" id="chart-tooltip"></div>' +
      '</div>' +
      '<p class="chart-figure-note" id="chart-desc"></p>' +
      '<details class="figures"><summary>Show monthly figures</summary><div id="figures-table"></div></details>';
  }
  buildDetailSkeleton();

  function yFor(v){ return CHART_PAD_T + (1 - v/MAX_PEAK) * (CHART_H - CHART_PAD_T - CHART_PAD_B); }
  function xFor(i, n){ return CHART_PAD_L + (i/(n-1)) * (CHART_W - CHART_PAD_L - CHART_PAD_R); }

  function renderChart(r){
    var chartSvg = document.getElementById('chart-svg');
    chartSvg.innerHTML = '';
    var curve = r.typical_season_cm;
    var n = curve.length;
    var color = regionColor(r.region);

    [0,100,200,300].forEach(function(gv){
      if(gv > MAX_PEAK) return;
      var y = yFor(gv);
      var line = document.createElementNS(svgNS,'line');
      line.setAttribute('class','gridline');
      line.setAttribute('x1', CHART_PAD_L); line.setAttribute('x2', CHART_W - CHART_PAD_R);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      chartSvg.appendChild(line);
      var lbl = document.createElementNS(svgNS,'text');
      lbl.setAttribute('class','axis-label');
      lbl.setAttribute('x', 4); lbl.setAttribute('y', y+3);
      lbl.textContent = gv;
      chartSvg.appendChild(lbl);
    });

    var months = [["2025-12-01","Dec"],["2026-01-01","Jan"],["2026-02-01","Feb"],["2026-03-01","Mar"],["2026-04-01","Apr"]];
    months.forEach(function(m){
      var idx = curve.findIndex(function(pt){ return pt[0] >= m[0]; });
      if(idx < 0) idx = 0;
      var x = xFor(idx, n);
      var lbl = document.createElementNS(svgNS,'text');
      lbl.setAttribute('class','axis-label');
      lbl.setAttribute('x', x); lbl.setAttribute('y', CHART_H - 8);
      lbl.setAttribute('text-anchor','middle');
      lbl.textContent = m[1];
      chartSvg.appendChild(lbl);
    });

    var pts = curve.map(function(pt,i){ return [xFor(i,n), yFor(pt[1])]; });
    var linePath = "M " + pts.map(function(p){ return p[0].toFixed(1)+","+p[1].toFixed(1); }).join(" L ");
    var baseY = yFor(0);
    var areaPath = linePath + " L " + pts[pts.length-1][0].toFixed(1) + "," + baseY + " L " + pts[0][0].toFixed(1) + "," + baseY + " Z";

    var gradId = "grad-" + r.id;
    var defs = document.createElementNS(svgNS,'defs');
    var grad = document.createElementNS(svgNS,'linearGradient');
    grad.setAttribute('id', gradId); grad.setAttribute('x1','0'); grad.setAttribute('y1','0'); grad.setAttribute('x2','0'); grad.setAttribute('y2','1');
    var s1 = document.createElementNS(svgNS,'stop'); s1.setAttribute('offset','0%'); s1.setAttribute('stop-color', color); s1.setAttribute('stop-opacity','0.5');
    var s2 = document.createElementNS(svgNS,'stop'); s2.setAttribute('offset','100%'); s2.setAttribute('stop-color', color); s2.setAttribute('stop-opacity','0');
    grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad); chartSvg.appendChild(defs);

    var area = document.createElementNS(svgNS,'path');
    area.setAttribute('d', areaPath); area.setAttribute('fill', 'url(#'+gradId+')'); area.setAttribute('class','area');
    chartSvg.appendChild(area);

    var line = document.createElementNS(svgNS,'path');
    line.setAttribute('d', linePath); line.setAttribute('class','line'); line.setAttribute('stroke', color);
    chartSvg.appendChild(line);

    var peakIdx = curve.reduce(function(best,pt,i){ return pt[1] > curve[best][1] ? i : best; }, 0);
    var peakPt = pts[peakIdx];
    var peakDot = document.createElementNS(svgNS,'circle');
    peakDot.setAttribute('cx', peakPt[0]); peakDot.setAttribute('cy', peakPt[1]); peakDot.setAttribute('r', 4);
    peakDot.setAttribute('fill', color);
    chartSvg.appendChild(peakDot);
    var peakLbl = document.createElementNS(svgNS,'text');
    peakLbl.setAttribute('class','peak-label');
    peakLbl.setAttribute('x', Math.min(peakPt[0]+8, CHART_W - CHART_PAD_R - 92));
    peakLbl.setAttribute('y', peakPt[1] - 10);
    peakLbl.textContent = r.typical_peak_cm + "cm peak, mid-Feb";
    chartSvg.appendChild(peakLbl);

    if(state.mode === 'season'){
      var posPt = pts[state.dayIndex];
      var posLine = document.createElementNS(svgNS,'line');
      posLine.setAttribute('class','position-line');
      posLine.setAttribute('x1', posPt[0]); posLine.setAttribute('x2', posPt[0]);
      posLine.setAttribute('y1', CHART_PAD_T); posLine.setAttribute('y2', CHART_H - CHART_PAD_B);
      chartSvg.appendChild(posLine);
      var posDot = document.createElementNS(svgNS,'circle');
      posDot.setAttribute('cx', posPt[0]); posDot.setAttribute('cy', posPt[1]); posDot.setAttribute('r', 4.5);
      posDot.setAttribute('fill', cssVar('--surface')); posDot.setAttribute('stroke', cssVar('--accent')); posDot.setAttribute('stroke-width', 2.2);
      chartSvg.appendChild(posDot);
      if(state.dayIndex !== peakIdx){
        var posLbl = document.createElementNS(svgNS,'text');
        posLbl.setAttribute('class','position-label');
        var lx = posPt[0] + (posPt[0] > CHART_W*0.6 ? -8 : 8);
        posLbl.setAttribute('x', lx); posLbl.setAttribute('y', posPt[1] - 10);
        posLbl.setAttribute('text-anchor', posPt[0] > CHART_W*0.6 ? 'end' : 'start');
        posLbl.textContent = "viewing " + Math.round(curve[state.dayIndex][1]) + "cm";
        chartSvg.appendChild(posLbl);
      }
    }

    var crossLine = document.createElementNS(svgNS,'line');
    crossLine.setAttribute('class','crosshair-line');
    crossLine.setAttribute('y1', CHART_PAD_T); crossLine.setAttribute('y2', CHART_H - CHART_PAD_B);
    crossLine.style.display = 'none';
    chartSvg.appendChild(crossLine);
    var hoverDot = document.createElementNS(svgNS,'circle');
    hoverDot.setAttribute('class','hover-dot'); hoverDot.setAttribute('r', 4.5);
    hoverDot.setAttribute('stroke', color);
    hoverDot.style.display = 'none';
    chartSvg.appendChild(hoverDot);

    var hit = document.createElementNS(svgNS,'rect');
    hit.setAttribute('class','chart-hit');
    hit.setAttribute('x', CHART_PAD_L); hit.setAttribute('y', 0);
    hit.setAttribute('width', CHART_W - CHART_PAD_L - CHART_PAD_R); hit.setAttribute('height', CHART_H);
    chartSvg.appendChild(hit);

    var tooltip = document.getElementById('chart-tooltip');
    function pointerToIndex(clientX){
      var box = chartSvg.getBoundingClientRect();
      var svgX = (clientX - box.left) / box.width * CHART_W;
      var t = (svgX - CHART_PAD_L) / (CHART_W - CHART_PAD_L - CHART_PAD_R);
      var idx = Math.round(t * (n-1));
      return Math.max(0, Math.min(n-1, idx));
    }
    function moveHover(e){
      var idx = pointerToIndex(e.clientX);
      var p = pts[idx];
      crossLine.setAttribute('x1', p[0]); crossLine.setAttribute('x2', p[0]);
      crossLine.style.display = '';
      hoverDot.setAttribute('cx', p[0]); hoverDot.setAttribute('cy', p[1]);
      hoverDot.style.display = '';
      var box = chartSvg.getBoundingClientRect();
      var pxX = box.left + (p[0]/CHART_W) * box.width;
      var pxY = box.top + (p[1]/CHART_H) * box.height;
      var wrap = chartSvg.parentElement.getBoundingClientRect();
      tooltip.style.left = (pxX - wrap.left) + "px";
      tooltip.style.top = (pxY - wrap.top) + "px";
      tooltip.innerHTML = fmtDate(curve[idx][0]) + "<br><b>" + curve[idx][1].toFixed(0) + " cm</b>";
      tooltip.classList.add('visible');
    }
    hit.addEventListener('mousemove', moveHover);
    hit.addEventListener('mouseleave', function(){
      crossLine.style.display = 'none'; hoverDot.style.display = 'none'; tooltip.classList.remove('visible');
    });
  }

  function renderFigures(r){
    var checkpoints = ["2025-12-15","2026-01-15","2026-02-14","2026-03-15","2026-04-15"];
    var rows = checkpoints.map(function(cp){
      var closest = r.typical_season_cm.reduce(function(best,pt){
        return Math.abs(new Date(pt[0])-new Date(cp)) < Math.abs(new Date(best[0])-new Date(cp)) ? pt : best;
      });
      return "<tr><td>" + fmtDate(closest[0]) + "</td><td>" + closest[1].toFixed(0) + " cm</td></tr>";
    }).join("");
    document.getElementById('figures-table').innerHTML =
      '<table class="figures-table"><thead><tr><th>Date</th><th>Typical depth</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function renderDetail(r){
    var disp = getDisplay(r);
    var curved = hasCurve(r);
    var liveView = state.mode === 'live' || !curved;
    document.getElementById('d-name').textContent = r.name;
    document.getElementById('d-region').textContent =
      r.prefecture && r.prefecture !== r.region ? r.prefecture + ' · ' + r.region : r.region;
    document.getElementById('d-badge').querySelector('.dot').style.background = regionColor(r.region);
    document.getElementById('d-snow-k').textContent = liveView ? 'Live snow' : 'Snow, ' + fmtDate(DATES[state.dayIndex]);
    document.getElementById('d-temp-k').textContent = liveView ? 'Live temp' : 'Temp, ' + fmtDate(DATES[state.dayIndex]);
    document.getElementById('d-live').textContent = Math.round(disp.depth) + "cm";
    document.getElementById('d-live').classList.toggle('muted', disp.depth === 0);
    document.getElementById('d-temp').textContent = disp.temp.toFixed(0) + "°C";
    document.getElementById('d-peak').textContent = curved ? r.typical_peak_cm + "cm" : "—";
    document.getElementById('d-elev').textContent = fmtElevation(r);
    document.getElementById('d-runs-stat').hidden = !r.run_km;
    document.getElementById('d-runs').textContent = r.run_km ? r.run_km + " km" : "";

    document.getElementById('d-nocurve').hidden = curved;
    detailCard.querySelector('.chart-wrap').hidden = !curved;
    document.getElementById('chart-desc').hidden = !curved;
    detailCard.querySelector('details.figures').hidden = !curved;
    if(!curved) return;

    renderChart(r);
    renderFigures(r);
    document.getElementById('chart-desc').textContent =
      "Illustrative typical-season pattern for " + r.name + ": snowpack builds through December, peaks around " +
      r.typical_peak_cm + "cm in mid-February, and melts out by late April.";
  }

  // Every state change goes through here, so "changed state but forgot to
  // re-render" isn't a bug that's possible to write anymore — refreshAll()
  // always fully re-syncs the DOM to whatever `state` now holds.
  function setState(patch){
    Object.assign(state, patch);
    refreshAll();
  }

  function select(id){
    setState({ selectedId: id });
    revealRowInList(id);
  }

  // Row click: select, and bring the resort into view if it isn't (a search
  // match can be anywhere; a small resort may also be below its reveal zoom).
  function selectFromList(r){
    select(r.id);
    var needZoom = TIER_MIN_ZOOM[r.tier] || 0;
    if(!map.getBounds().contains([r.lat, r.lon]) || map.getZoom() < needZoom){
      map.setView([r.lat, r.lon], Math.max(map.getZoom(), needZoom));
    }
  }

  // Scroll the list's own container, never the page: scrollIntoView would
  // also scroll the window if the list card were partly off-screen.
  function revealRowInList(id){
    var refs = rowEls[id];
    if(!refs || refs.root.hidden) return;
    var lr = listEl.getBoundingClientRect(), rr = refs.root.getBoundingClientRect();
    if(rr.top < lr.top) listEl.scrollTop -= (lr.top - rr.top);
    else if(rr.bottom > lr.bottom) listEl.scrollTop += (rr.bottom - lr.bottom);
  }

  function updateSelectionHighlight(){
    Object.keys(markerEls).forEach(function(k){
      var el = markerEls[k].getElement();
      if(el) el.classList.toggle('is-selected', k===state.selectedId);
    });
    Object.keys(rowEls).forEach(function(k){ rowEls[k].root.classList.toggle('is-selected', k===state.selectedId); });
  }

  // The part of a refresh that depends on the map view (zoom/pan), split out
  // so panning doesn't also redraw the detail chart.
  function refreshMapView(){
    computeRanking();
    renderMarkers();
    renderList();
    renderFilters();
    renderStatus();
    updateSelectionHighlight();
    scheduleLiveRefresh();
    maybeFitRanking();
  }

  function refreshAll(){
    refreshMapView();
    renderSizeLegend();
    updateFetchMeta(); // mode-dependent; pointless to redo on every pan, so not in refreshMapView
    var r = DATA.resorts.filter(function(x){ return x.id === state.selectedId; })[0];
    if(r) renderDetail(r);
    updateDateLabel();
  }
  map.on('moveend', refreshMapView);

  function updateDateLabel(){
    var lbl = fmtDate(DATES[state.dayIndex]);
    if(state.dayIndex === PEAK_INDEX) lbl += " (peak)";
    document.getElementById('date-current').textContent = lbl;
  }

  // ---- controls ----
  var modeLiveBtn = document.getElementById('mode-live');
  var modeSeasonBtn = document.getElementById('mode-season');
  var dateRow = document.getElementById('date-row');
  var slider = document.getElementById('date-slider');

  function setMode(mode){
    // These reflect the mode-toggle widget's own visual state, not the
    // "does the DOM match `state`" job setState()/refreshAll() do — kept
    // colocated with the control that owns them.
    modeLiveBtn.classList.toggle('is-active', mode === 'live');
    modeSeasonBtn.classList.toggle('is-active', mode === 'season');
    modeLiveBtn.setAttribute('aria-selected', mode === 'live');
    modeSeasonBtn.setAttribute('aria-selected', mode === 'season');
    dateRow.style.opacity = mode === 'season' ? '1' : '.35';
    slider.disabled = mode !== 'season';
    // Snow depths are only real in Live mode, so leaving it ends a snow ranking.
    setState(mode !== 'live' && state.ranking === 'snow' ? { mode: mode, ranking: null } : { mode: mode });
  }
  modeLiveBtn.addEventListener('click', function(){ setMode('live'); });
  modeSeasonBtn.addEventListener('click', function(){ setMode('season'); });
  slider.addEventListener('input', function(){
    setState({ dayIndex: parseInt(slider.value, 10) });
  });

  document.getElementById('resort-count').textContent = DATA.resorts.length;

  slider.value = PEAK_INDEX;
  setMode('season');
  select("niseko");

  // ---- resort-list height, matched to the map card ----
  // Neither card has an externally imposed height for a CSS-only "shrink to
  // match your sibling" rule to apply against — the grid's own height comes
  // from its children's content in the first place — so the match is done
  // here instead: measure the map card once laid out, and set the list
  // card's height to the same value so its own content scrolls internally.
  // Above the 860px breakpoint where .grid stacks to one column, the inline
  // height is cleared so the list flows with the page normally.
  var mapCardEl = document.querySelector('.map-card');
  var listCardEl = document.querySelector('.resort-list-card');
  function syncResortListHeight(){
    if(window.innerWidth <= 860){
      listCardEl.style.height = '';
      return;
    }
    listCardEl.style.height = mapCardEl.getBoundingClientRect().height + 'px';
  }
  syncResortListHeight();
  window.addEventListener('resize', syncResortListHeight);
  } // end of the `typeof document !== 'undefined'` guard

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hexToRgb: hexToRgb, lerpColor: lerpColor, tempToColor: tempToColor,
      depthToRadius: depthToRadius, fmtDate: fmtDate, fmtFetched: fmtFetched,
      computeTooltipPosition: computeTooltipPosition,
      hasCurve: hasCurve, fmtElevation: fmtElevation, escapeHtml: escapeHtml,
      isTierRevealed: isTierRevealed, matchesQuery: matchesQuery, passesFilters: passesFilters,
      isEligible: isEligible, classifyResort: classifyResort, isListed: isListed,
      rankResorts: rankResorts, isRankingReady: isRankingReady, TOP_N: TOP_N, RANKINGS: RANKINGS,
      REGION_ORDER: REGION_ORDER, TIER_ORDER: TIER_ORDER, TIER_MIN_ZOOM: TIER_MIN_ZOOM,
      sortResorts: sortResorts, fetchMetaLabel: fetchMetaLabel };
  }
})();
