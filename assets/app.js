(function(){
  "use strict";

  // ---- pure config + helpers ----
  // Nothing below this point touches the DOM, so it's safe for a Node test
  // to require() this file directly (see the module.exports guard at the
  // bottom). Everything that does touch the DOM/Leaflet/fetch lives inside
  // the `typeof document !== 'undefined'` guard further down, which a
  // require() in Node skips entirely.
  var REGION_ORDER = ["Hokkaido","Tohoku","Nagano","Niigata"];
  var REGION_VAR = {Hokkaido:"--hokkaido", Tohoku:"--tohoku", Nagano:"--nagano", Niigata:"--niigata"};
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
  var DATES = DATA.resorts[0].typical_season_cm.map(function(p){ return p[0]; });
  var PEAK_INDEX = 25; // mid-Feb, index into the 3-day-step curve arrays

  var state = { mode: 'season', dayIndex: PEAK_INDEX, selectedId: null };

  function cssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function regionColor(region){ return cssVar(REGION_VAR[region] || "--accent"); }

  function getDisplay(r){
    if(state.mode === 'live'){
      return { depth: r.snow_depth_cm, temp: r.temperature_c, label: 'Live now' };
    }
    var d = r.typical_season_cm[state.dayIndex][1];
    var t = r.typical_season_temp_c[state.dayIndex][1];
    var lbl = fmtDate(DATES[state.dayIndex]) + (state.dayIndex===PEAK_INDEX ? ' (typical peak)' : '');
    return { depth: d, temp: t, label: lbl };
  }

  // ---- header meta ----
  function updateFetchMeta(){
    var label = DATA.live_fetch_ok === false ? "SNAPSHOT (LIVE REFRESH FAILED)" : "LIVE DATA FETCHED";
    document.getElementById('fetch-meta').innerHTML =
      label + "<br>" + fmtFetched(DATA.generated_at) + " JST<br>source: open-meteo.com";
  }
  updateFetchMeta();

  // ---- live client-side refresh ----
  // The page renders instantly from the snapshot baked in at build time (above);
  // this fetches current conditions directly from Open-Meteo and upgrades the
  // in-memory data in place once it resolves. Falls back silently to the
  // snapshot if the fetch fails for any reason (offline, API hiccup, etc).
  function fetchLiveConditions(){
    var lats = DATA.resorts.map(function(r){ return r.lat; }).join(",");
    var lons = DATA.resorts.map(function(r){ return r.lon; }).join(",");
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lats + "&longitude=" + lons +
      "&current=snow_depth,temperature_2m,weather_code&timezone=Asia%2FTokyo";
    fetch(url).then(function(res){
      if(!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function(live){
      if(!Array.isArray(live) || live.length !== DATA.resorts.length){
        throw new Error("unexpected response shape");
      }
      var fetchedAt = null;
      DATA.resorts.forEach(function(r, i){
        var cur = live[i].current;
        r.snow_depth_cm = Math.round(cur.snow_depth * 1000) / 10;
        r.temperature_c = cur.temperature_2m;
        r.weather_code = cur.weather_code;
        fetchedAt = cur.time;
      });
      DATA.generated_at = fetchedAt;
      DATA.live_fetch_ok = true;
      updateFetchMeta();
      if(state.mode === 'live') refreshAll();
    }).catch(function(err){
      DATA.live_fetch_ok = false;
      updateFetchMeta();
      console.warn("Live conditions fetch failed, showing last-built snapshot:", err);
    });
  }

  // ---- map ----
  var svgNS = "http://www.w3.org/2000/svg"; // still used by the chart and size-legend SVGs below

  // scrollWheelZoom is off deliberately: a map embedded in a scrolling page
  // that captures the mouse wheel fights the page scroll the moment the
  // cursor happens to be over it. The zoom buttons, double-click, and touch
  // pinch-zoom (Leaflet defaults) all still work.
  var map = L.map('map', { scrollWheelZoom: false });
  var bounds = L.latLngBounds(DATA.resorts.map(function(r){ return [r.lat, r.lon]; }));
  map.fitBounds(bounds, { padding: [28, 28] });

  // A single tile source (plain OpenStreetMap, no API key ever required) kept
  // for both themes; dark mode is a CSS filter on the tile layer rather than a
  // second tile provider, since free "dark" tile services have a habit of
  // adding API-key requirements later without much notice.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

  var markerEls = {};
  DATA.resorts.forEach(function(r){
    var m = L.circleMarker([r.lat, r.lon], { className: 'marker' });
    m.on('click', function(){ select(r.id); });
    m.on('mouseover', function(e){ showMapTip(e.originalEvent, r); });
    m.on('mousemove', function(e){ showMapTip(e.originalEvent, r); });
    m.on('mouseout', hideMapTip);
    m.addTo(map);
    // Leaflet's SVG renderer gives each circle marker a real DOM element, so it
    // can be made keyboard-operable the same way the old plain-SVG markers were.
    var el = m.getElement();
    if(el){
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); select(r.id); }
      });
    }
    markerEls[r.id] = m;
  });

  var mapTip = document.getElementById('map-tooltip');
  function showMapTip(e, r){
    var disp = getDisplay(r);
    mapTip.innerHTML = "<b>" + r.name + "</b>" + r.region + " &middot; " + r.elevation_top_m + "m top" +
      "<br>" + disp.label + ": " + Math.round(disp.depth) + "cm, " + disp.temp.toFixed(1) + "&deg;C" +
      "<br>Typical peak: " + r.typical_peak_cm + "cm";

    var tipRect = mapTip.getBoundingClientRect(); // opacity:0 still lays out, so this reflects real content size
    var pos = computeTooltipPosition(e.clientX, e.clientY, tipRect.width, tipRect.height, window.innerWidth, window.innerHeight, 14);

    mapTip.style.left = pos.x + "px";
    mapTip.style.top = pos.y + "px";
    mapTip.classList.add('visible');
  }
  function hideMapTip(){ mapTip.classList.remove('visible'); }

  function renderMarkers(){
    DATA.resorts.forEach(function(r){
      var disp = getDisplay(r);
      var m = markerEls[r.id];
      var radius = depthToRadius(disp.depth);
      var color = tempToColor(disp.temp, cssVar('--temp-cold'), cssVar('--temp-mid'), cssVar('--temp-warm'));
      if(disp.depth <= 0.05){
        m.setStyle({ radius: radius, color: color, weight: 2.2, fillOpacity: 0 });
      } else {
        m.setStyle({ radius: radius, color: cssVar('--surface'), weight: 1.6, fillColor: color, fillOpacity: 1 });
      }
      var el = m.getElement();
      if(el){
        el.setAttribute('aria-label', r.name + ", " + r.region + ", " + Math.round(disp.depth) + " centimeters, " + disp.temp.toFixed(0) + " degrees");
      }
    });
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
  var listEl = document.getElementById('resort-list');
  var byRegion = {};
  DATA.resorts.forEach(function(r){ (byRegion[r.region] = byRegion[r.region]||[]).push(r); });
  var rowEls = {};
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
    group.appendChild(heading);
    items.forEach(function(r){
      var row = document.createElement('button');
      row.className = 'resort-row';
      row.type = 'button';
      row.addEventListener('click', function(){ select(r.id); });

      // Built once per resort; renderList() below only ever updates these
      // nodes' textContent, never rebuilds them, so resort data can't
      // break the row's markup no matter what it contains.
      var nameEl = document.createElement('span'); nameEl.className = 'name';
      var liveEl = document.createElement('span'); liveEl.className = 'live';
      var peakEl = document.createElement('span'); peakEl.className = 'peak';
      var elevEl = document.createElement('span'); elevEl.className = 'elev';
      nameEl.textContent = r.name;
      row.appendChild(nameEl);
      row.appendChild(liveEl);
      row.appendChild(peakEl);
      row.appendChild(elevEl);

      group.appendChild(row);
      rowEls[r.id] = { root: row, live: liveEl, peak: peakEl, elev: elevEl };
    });
    listEl.appendChild(group);
  });

  function renderList(){
    DATA.resorts.forEach(function(r){
      var disp = getDisplay(r);
      var refs = rowEls[r.id];
      var whenLabel = state.mode === 'live' ? 'now' : fmtDate(DATES[state.dayIndex]);
      refs.live.textContent = Math.round(disp.depth) + 'cm ' + whenLabel;
      refs.peak.textContent = r.typical_peak_cm + 'cm peak';
      refs.elev.textContent = r.elevation_top_m + 'm · ' + disp.temp.toFixed(0) + '°C';
    });
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
        '</div>' +
      '</div>' +
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
    document.getElementById('d-name').textContent = r.name;
    document.getElementById('d-region').textContent = r.region;
    document.getElementById('d-badge').querySelector('.dot').style.background = regionColor(r.region);
    document.getElementById('d-snow-k').textContent = state.mode === 'live' ? 'Live snow' : 'Snow, ' + fmtDate(DATES[state.dayIndex]);
    document.getElementById('d-temp-k').textContent = state.mode === 'live' ? 'Live temp' : 'Temp, ' + fmtDate(DATES[state.dayIndex]);
    document.getElementById('d-live').textContent = Math.round(disp.depth) + "cm";
    document.getElementById('d-live').classList.toggle('muted', disp.depth === 0);
    document.getElementById('d-temp').textContent = disp.temp.toFixed(0) + "°C";
    document.getElementById('d-peak').textContent = r.typical_peak_cm + "cm";
    document.getElementById('d-elev').textContent = r.elevation_top_m + "m";

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
  }

  function updateSelectionHighlight(){
    Object.keys(markerEls).forEach(function(k){
      var el = markerEls[k].getElement();
      if(el) el.classList.toggle('is-selected', k===state.selectedId);
    });
    Object.keys(rowEls).forEach(function(k){ rowEls[k].root.classList.toggle('is-selected', k===state.selectedId); });
  }

  function refreshAll(){
    renderMarkers();
    renderList();
    renderSizeLegend();
    updateSelectionHighlight();
    var r = DATA.resorts.filter(function(x){ return x.id === state.selectedId; })[0];
    if(r) renderDetail(r);
    updateDateLabel();
  }

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
    setState({ mode: mode });
  }
  modeLiveBtn.addEventListener('click', function(){ setMode('live'); });
  modeSeasonBtn.addEventListener('click', function(){ setMode('season'); });
  slider.addEventListener('input', function(){
    setState({ dayIndex: parseInt(slider.value, 10) });
  });

  slider.value = PEAK_INDEX;
  setMode('season');
  select("niseko");
  fetchLiveConditions();

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
      computeTooltipPosition: computeTooltipPosition };
  }
})();
