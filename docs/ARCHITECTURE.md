# Architecture

## Overview

Foray Ski Adventure is a static, backend-free web page, deployed via GitHub
Pages. There's no server: a Ruby build script computes everything it can
ahead of time and inlines it into `index.html` as JSON, so the page renders
instantly from that snapshot on load — and then the browser makes one direct
request to Open-Meteo to refresh live conditions in place. Historically (see
below) even that client-side request wasn't possible.

This shape is a holdover from the project's original deployment target, a
Claude Artifact, which sandboxes the page: no outbound network requests, no
external map tiles. GitHub Pages has no such restriction, which is what
made the live client-side fetch possible — but the map is still the
sandbox-era static SVG (see [PROPOSALS.md](./PROPOSALS.md) for the plan to
replace it with real tiles).

## Build-time pipeline

```mermaid
flowchart LR
  R[data/resorts.json<br/>resort metadata + curve tuning] --> B(scripts/build_data.rb)
  G[data/japan_boundary.geojson<br/>simplified national outline] --> B
  OM[(Open-Meteo API<br/>live snow_depth + temperature)] --> B
  B --> S[data/ski_data.json<br/>generated dataset]
  S --> T[template.html<br/>has a __SKI_DATA_JSON__ placeholder]
  T --> I[index.html<br/>final page, data inlined]
```

`scripts/build_data.rb` does four things, in order, every time it runs:

1. **Fetch live conditions.** One batched HTTPS request to Open-Meteo for all
   resorts' current `snow_depth` and `temperature_2m`.
2. **Project the map.** Reads the simplified Japan boundary GeoJSON, computes
   an equirectangular projection with a cosine correction for longitude
   (so Hokkaido and Honshu keep the right relative shape), and produces one
   SVG path string for the coastline plus an `(x, y)` pair per resort.
3. **Generate the illustrative season curve.** For each resort, a bell curve
   (peaking at each resort's own `typical_peak_cm` on a shared mid-February
   date) and a parabolic temperature curve (mild at the season edges, coldest
   at that same date) are sampled every 3 days from Dec 1 to Apr 30. This is
   synthetic — clearly labeled as such in the UI — because no real historical
   time series exists yet.
4. **Write outputs.** `data/ski_data.json` (the raw generated dataset, useful
   on its own) and `index.html` (the template with that JSON spliced into the
   `<script type="application/json">` placeholder).

## Client-side render pipeline

Everything after that is a single inline `<script>` in `index.html`, an IIFE
with no external dependencies. There's one mutable `state` object
(`{ mode, dayIndex, selectedId }`) and a `refreshAll()` function that
re-derives all on-screen output from `state` + the embedded `DATA`:

| Function | Responsibility |
|---|---|
| `getDisplay(resort)` | Picks live vs. typical-season values for one resort based on `state.mode`/`state.dayIndex` |
| `tempToColor(temp)` | Diverging color scale, temperature → hex/rgb |
| `depthToRadius(depth)` | Area-proportional size scale, snow depth → marker radius |
| `renderMarkers()` | Updates every map `<circle>`'s radius/fill/stroke |
| `renderList()` | Rewrites each resort row's text in the sidebar list |
| `renderSizeLegend()` | Draws the size-legend circles using the same `depthToRadius` scale |
| `renderChart(resort)` / `renderFigures(resort)` | Draws the selected resort's season chart and monthly-figures table |
| `renderDetail(resort)` | Updates the stat row and calls the chart/figures renderers |
| `select(id)` / `setMode(mode)` / slider handler | Mutate `state`, then call `refreshAll()` (or `renderDetail` directly for `select`) |

There is no framework, no virtual DOM, and no build step on the client side —
`refreshAll()` just re-renders everything on every state change, which is fine
at this scale (20 resorts, a handful of DOM nodes each).

## Key design decisions

- **Area, not radius, for marker size.** Radius scaling linearly with depth
  makes a 6x difference in snow depth look like a ~33x difference in visual
  area (Stevens' power law). `depthToRadius` scales so *area* is proportional
  to depth (`radius ∝ √depth`), which is the standard, honest convention for
  proportional-symbol maps.
- **Diverging temperature color, centered on 0°C, with squared easing.** Blue
  below freezing, neutral gray at freezing, warm above — because freezing is
  the threshold that actually matters for snow. Linear interpolation between
  the cold and neutral colors looked muddy for realistic winter temperatures
  (mostly -6°C to -16°C), so the interpolation fraction is squared, which
  keeps hues saturated away from the pole and reserves gray for values
  genuinely close to 0°C.
- **0cm renders as a hollow ring at 60% of the floor size**, not a filled dot.
  A filled dot at the minimum radius is visually close to "a small amount of
  snow," which is ambiguous. A smaller, hollow ring is unambiguously "bare
  ground."
- **A static, pre-projected SVG map instead of tile imagery.** The Claude
  Artifact sandbox blocks loading map tiles from any external host, so the
  coastline is a single baked SVG `<path>` computed once at build time, and
  resort coordinates are pre-projected `(x, y)` pairs rather than raw lat/lon
  resolved in the browser. This has real costs — see PROPOSALS.md — but it's
  the only option that works inside the sandbox and needs zero client-side
  geo libraries.
- **The build-time snapshot is embedded inline, and the page opens with it
  immediately** — there is no loading state for the initial render. On GitHub
  Pages, a `fetchLiveConditions()` call then goes out to Open-Meteo directly
  from the browser (the same batched request `build_data.rb` makes) and
  overwrites each resort's live depth/temperature in place once it resolves;
  if it fails for any reason, the page just keeps showing the snapshot and
  the header label switches to "snapshot (live refresh failed)". This was not
  possible under the Claude Artifact sandbox, which blocks `fetch`/XHR to
  external hosts — that version still relies entirely on the baked-in
  snapshot.
- **The season curve is synthetic, not measured.** It exists to make the
  visualization meaningful during the off-season (when live depth is 0cm
  almost everywhere) and to preview what the size/color encoding looks like
  across a full range of values. It is explicitly labeled as illustrative
  everywhere it appears.

## Known constraints (as of this snapshot)

- Live conditions refresh client-side on GitHub Pages, but the "typical
  season" curve, the map coastline, and resort coordinates are still fixed
  at whatever `scripts/build_data.rb` last produced — regenerating those
  still requires re-running the script and redeploying.
- The Claude Artifact version has no live network access at all (sandboxed);
  it always shows the build-time snapshot.
- No real historical data — the "typical season" curve is a hand-tuned bell
  curve, not recorded observations.
- No automated tests (see PROPOSALS.md, section 3).
- All logic — CSS, HTML, and ~450 lines of JS — lives in one file
  (`template.html`), with no module boundaries.
