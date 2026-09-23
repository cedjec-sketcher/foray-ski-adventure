// Test hooks for driving the real page in a browser. Not loaded by index.html:
// scripts/build_debug_page.rb splices this into tmp/debug.html just before
// assets/app.js. Nothing here ships.
//
//   window.__map        the Leaflet map (app.js keeps it private otherwise)
//   window.__fetches    location count of every Open-Meteo request the page makes
//
// Add ?winter to the URL to answer Open-Meteo requests locally with a synthetic
// winter, so features that need snow can be tested in September. Options:
//   mockDepth=N   every resort has N cm (0 = the off-season case)
//   mockFail=K    the K-th request (counting from 1) fails with HTTP 429
//   mockDelay=MS  answer after MS milliseconds (to observe "fetching" states)
(function(){
  L.Map.addInitHook(function(){ window.__map = this; });
  window.__fetches = [];

  var q = new URLSearchParams(location.search);
  var realFetch = window.fetch;
  var resorts = JSON.parse(document.getElementById('ski-data').textContent).resorts;
  var byCoord = {};
  resorts.forEach(function(r){ byCoord[r.lat + ',' + r.lon] = r; });

  function hash(s){ var h = 0; for(var i = 0; i < s.length; i++){ h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
  // Whole-cm depths in 10 cm steps, 0..390, fixed per resort. About 1 in 40
  // resorts has none, and many share a value on purpose: ties are the case
  // the ranking's tie-break exists for.
  function depthCm(r){
    if(q.has('mockDepth')) return Number(q.get('mockDepth'));
    return (hash(r.id) % 40) * 10;
  }
  window.__mockWinter = { depthCm: depthCm };

  var calls = 0;
  window.fetch = function(url){
    var u = String(url);
    var m = u.match(/latitude=([^&]*)&longitude=([^&]*)/);
    if(!m) return realFetch.apply(this, arguments);
    var lats = m[1].split(','), lons = m[2].split(',');
    window.__fetches.push(lats.length);
    if(!q.has('winter')) return realFetch.apply(this, arguments);

    calls++;
    var delay = Number(q.get('mockDelay')) || 0;
    var respond = function(status, body){
      return new Promise(function(resolve){
        setTimeout(function(){
          resolve(new Response(JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } }));
        }, delay);
      });
    };
    if(Number(q.get('mockFail')) === calls) return respond(429, { error: true, reason: 'mock rate limit' });

    var out = lats.map(function(la, i){
      var r = byCoord[Number(la) + ',' + Number(lons[i])];
      if(!r) throw new Error('mock: no resort at ' + la + ',' + lons[i]);
      return { current: { time: '2026-01-15T12:00', snow_depth: depthCm(r) / 100, temperature_2m: -6, weather_code: 71 } };
    });
    // like the real API: a single location comes back as a bare object
    return respond(200, out.length === 1 ? out[0] : out);
  };
})();
