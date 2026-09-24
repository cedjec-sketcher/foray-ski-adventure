# Foray Ski Adventure — Japan Snowpack

[![Test](https://github.com/cedjec-sketcher/foray-ski-adventure/actions/workflows/test.yml/badge.svg)](https://github.com/cedjec-sketcher/foray-ski-adventure/actions/workflows/test.yml)

A single-page map of ~480 Japanese ski resorts (Hokkaido to Kyushu) on a
real, pannable/zoomable [Leaflet](https://leafletjs.com/) + OpenStreetMap
map, showing live snow depth and temperature from
[Open-Meteo](https://open-meteo.com) (fetched directly in the browser). The
~27 larger resorts also have an illustrative typical-season pattern
(Dec–Apr); the smaller ones are live-only.

- Marker **size** = snow depth (area-scaled, not radius)
- Marker **color** = temperature (diverging, centered on 0°C)
- A resort with 0cm renders as a small hollow ring rather than a filled dot
- **Zoom reveals smaller resorts**: major ones are always shown, medium ones
  from zoom 6, small ones from zoom 8
- **The list is the filter**: search, region chips and size chips narrow the
  list *and* the map (filtered-out resorts become faint dots), and by
  default the list only shows what's in the map view
- **Top 10 lists**: Highest altitude (any mode) and Snowiest (Live mode
  only — it waits for every candidate to report in before ranking, rather
  than showing an order that reshuffles as data arrives)
- Dark mode uses a CSS filter on the same OpenStreetMap tiles rather than a
  second tile provider — see ARCHITECTURE.md for why

## Files

- `index.html` — the built, ready-to-open page (also the GitHub Pages entry
  point); references `assets/` and embeds only the generated JSON
- `template.html` — the source template; has a `__SKI_DATA_JSON__` placeholder
  where the data gets spliced in
- `assets/app.js` — all client-side rendering and interaction (map, list,
  chart, mode/date controls, the live-fetch call)
- `assets/styles.css` — all styling, including the light/dark theme tokens
- `data/resorts.json` — resort *facts*: name, region, prefecture,
  coordinates, top elevation, size tier, downhill run length. Mostly
  imported from OpenSkiMap (see below); edit it freely, re-importing never
  overwrites an existing entry
- `data/illustrative_curve_tuning.json` — the *other* per-resort concern,
  kept separate from the facts above: `peak_cm`/`min_c`/`edge_c`, keyed by
  resort id, feeding the synthetic typical-season curve. Once a resort has
  real historical data, its entry here just goes away — no need to touch
  `resorts.json`
- `data/fixture_conditions.json` — a captured live snapshot, used by the
  offline `fixture` provider (see below) instead of a real Open-Meteo request
- `data/ski_data.json` — generated output (live snow/temp fetch + seasonal
  curves); this is what `index.html` embeds
- `config/season.json` — the season's start/end/peak dates and bell-curve
  width; change this instead of editing code to shift the illustrative
  season (e.g. for a different hemisphere or mountain range)
- `lib/openskimap_import.rb` — pure logic for turning OpenSkiMap's ski-area
  GeoJSON into resort entries (regions, size tiers, name cleanup, matching
  the curated resorts, ids)
- `scripts/import_openskimap.rb` — downloads OpenSkiMap's data (cached in
  `tmp/`) and merges it into `data/resorts.json`
- `lib/season_curve.rb` — pure bell-curve/temperature-curve generation for the
  illustrative typical-season pattern (`config/season.json`'s values are
  passed in as parameters; the module itself does no I/O)
- `lib/providers.rb` — picks a data-source provider by name (or the
  `SNOWPACK_PROVIDER` env var), so `scripts/build_data.rb` calls `.fetch(resorts)`
  without knowing which one answered
- `lib/providers/open_meteo.rb` — the real, live provider
- `lib/providers/fixture.rb` — an offline provider reading
  `data/fixture_conditions.json`; useful with no network access, or for a
  fast, deterministic local build
- `scripts/build_data.rb` — thin orchestrator: resolves a provider, reads the
  season config, merges the curve-tuning file into the resort facts, calls
  the `lib/` modules above, writes `data/ski_data.json`, and rebuilds
  `index.html` from `template.html`
- `test/*.rb`, `test/providers/*.rb` — Ruby unit tests for the `lib/` modules
  (`rake test` to run them)
- `test/js/app.test.js` — Node unit tests for `assets/app.js`'s pure
  functions, including the Top-10 ranking logic (`node --test test/js` to
  run them)
- `test/browser/` — checks that drive the built page in a real browser
  against a mocked winter (`debug_hooks.js`, `ranking_check.js`); see
  "Browser checks" below. Not run in CI yet (see docs/PROPOSALS.md)
- `scripts/build_debug_page.rb` — builds `tmp/debug.html`, `index.html`
  with `test/browser/debug_hooks.js` spliced in, for the browser checks
- `Rakefile` — defines the `rake test` task

## Regenerating the data

Requires Ruby (ships with macOS, no gems needed):

```bash
ruby scripts/build_data.rb
```

This refreshes `data/ski_data.json` with a fresh live snow/temperature fetch
and rewrites `index.html`, stamping `assets/app.js`/`assets/styles.css` with
a content-hash query string (`?v=...`) so GitHub Pages' 10-minute asset
cache doesn't hide a real change — **always run this after editing either
file**, or the deployed page will keep serving the old one for up to 10
minutes even after you push.

To build without hitting Open-Meteo at all (no network access, or a fast
deterministic build), use the offline fixture provider instead:

```bash
SNOWPACK_PROVIDER=fixture ruby scripts/build_data.rb
```

This reads `data/fixture_conditions.json` — a real captured snapshot, just
frozen in time — instead of making a live request.

## Adding or refreshing resorts

`data/resorts.json` was grown from 20 hand-picked resorts to ~480 by importing
operating downhill ski areas from [OpenSkiMap](https://openskimap.org):

```bash
ruby scripts/import_openskimap.rb
```

It downloads OpenSkiMap's `ski_areas.geojson` (they ask for at most one
automated download a day, so it's cached in `tmp/` and reused until you delete
it), adds any area not already in `resorts.json`, and leaves every existing
entry untouched. Pass a path to use a file you already have. The 20 hand-picked
resorts are matched to OpenSkiMap by name (the `MATCHERS` table in the
script); one of them can absorb several OpenSkiMap areas (Shiga Kogen is 19).

After importing, run `ruby scripts/build_data.rb`. Every resort is live-only
until it has an entry in `data/illustrative_curve_tuning.json`, which is what
gives it a typical-season curve.

## Running the tests

Ruby's `minitest` and `rake` both ship with the system Ruby on macOS — nothing
to install:

```bash
rake test
```

Covers `lib/season_curve.rb` (pure curve math), `lib/providers/open_meteo.rb`
(with the network call stubbed, so it runs with no internet access),
`lib/providers/fixture.rb` and `lib/providers.rb`'s provider-selection
logic, `lib/openskimap_import.rb`, `assets/styles.css`'s three light/dark
`:root` blocks (guards against shipping a token in one theme but not the
other), a cross-check that the Ruby importer, `app.js`, the CSS and the real
data agree on the region list, and that `index.html` is up to date with the
assets and data it embeds.

Node's built-in test runner (Node 18+) covers `assets/app.js`'s pure
functions — the colour/size scales, date formatting, tooltip placement,
all of the marker/list visibility logic (`classifyResort`, `isListed`,
search, tier reveal), and the Top-10 ranking logic (`rankResorts`,
`isRankingReady`, ties, off-season-empty):

```bash
node --test test/js
```

Nothing else needed — no `npm install`, no test framework. `getDisplay` and
anything that touches the DOM (the map, the list, the chart) aren't covered
by either suite; see docs/PROPOSALS.md, "Testing gaps".

`.github/workflows/test.yml` runs both suites, as separate jobs, on every
push and pull request to `main`.

### Browser checks

`test/browser/` drives the actual built page in a browser — useful for
anything `node --test` can't reach because it needs the DOM, Leaflet, or a
winter's worth of live data that doesn't exist in September:

```bash
ruby scripts/build_debug_page.rb   # writes tmp/debug.html
ruby -run -e httpd . -p 8000
open http://localhost:8000/tmp/debug.html?winter&mockDelay=300
```

`?winter` makes every Open-Meteo request answer with a synthetic (but
fixed-per-resort, deterministic) snow depth instead of the real API, so the
Snowiest ranking, ties, and live-refresh states are all testable without
waiting for a real winter; see `test/browser/debug_hooks.js` for the other
query params (`mockFail`, `mockDepth`). `test/browser/ranking_check.js` is
a full check of the Top-10 lists against an independently-computed expected
result — from a JS console on that page:

```js
await (0, eval)(await (await fetch('/test/browser/ranking_check.js')).text())
```

`test/browser/forecast_check.js` does the same for the detail card's 7-day
forecast (fetch-once caching, the stale-response guard, failure and
missing-data states). It needs no debug page: it stubs Open-Meteo's forecast
requests itself, so run it on the normal page (`http://localhost:8000/`):

```js
await (0, eval)(await (await fetch('/test/browser/forecast_check.js')).text())
```

`tmp/` is gitignored and not committed; running `build_debug_page.rb`
regenerates it from whatever `index.html` currently is. These checks are
real regression coverage, but only run manually today — see
docs/PROPOSALS.md, "Structure & maintainability" for wiring them into CI.

## Viewing it locally

```bash
ruby -run -e httpd . -p 8000
```

Then open <http://localhost:8000/index.html>.

## Next steps

- See the **Backlog** in docs/PROPOSALS.md for the smaller open items
  (typical-season curves for the bigger resorts, resort-name cleanup, and
  more).
- **Daily snapshots**: a scheduled GitHub Actions workflow that runs
  `scripts/build_data.rb` daily and commits the result would turn the
  "typical season" chart into real recorded history over a winter. The
  provider interface (`lib/providers.rb`) gives this a natural home: a
  future `Providers::HistoricalArchive` reading the accumulated snapshots,
  swapped in the same way `fixture` is today.

## Data sources

- Live snow depth and temperature: [Open-Meteo](https://open-meteo.com) —
  free for non-commercial use with attribution; see their
  [terms](https://open-meteo.com/en/terms) before any commercial use. The
  free tier allows 600 calls/minute, 5,000/hour and 10,000/day per IP.
  Open-Meteo doesn't document whether a request for many locations counts as
  one call or one per location, so the page assumes the worse case and only
  refreshes the resorts currently on screen.
- Resort names, locations, elevations and run lengths:
  [OpenSkiMap](https://openskimap.org) / [OpenSkiData](https://openskidata.org),
  derived from OpenStreetMap data © OpenStreetMap contributors, available
  under the [ODbL](https://opendatacommons.org/licenses/odbl/). See
  [DATA_LICENSE.md](./DATA_LICENSE.md).
- Map tiles: [OpenStreetMap](https://www.openstreetmap.org/copyright) —
  free, with an acceptable-use policy for the public tile server (fine for
  this project's traffic).

## License

[MIT](./LICENSE) for the code. The **data is not all MIT**: the resort data
(`data/resorts.json`, `data/ski_data.json` and its copy embedded in
`index.html`) is under the [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)
because it derives from OpenSkiMap / OpenStreetMap, and the live weather
values are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) from
Open-Meteo. [DATA_LICENSE.md](./DATA_LICENSE.md) lists which files are under
which terms, and what reusing them requires.

## More docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the build pipeline and
  the client-side rendering fit together, and why it's shaped this way
- [docs/CHANGELOG.md](docs/CHANGELOG.md) — the "done" history of what
  shipped and why
- [docs/PROPOSALS.md](docs/PROPOSALS.md) — what's still open: proposed
  improvements to code structure, data-source/map flexibility, and test
  coverage
