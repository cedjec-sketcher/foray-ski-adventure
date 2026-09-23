# Changelog

The "— done" history that used to live inside `docs/PROPOSALS.md`, split out
on 2026-09-22 so that file could stay focused on what's still open (see
[PROPOSALS.md](./PROPOSALS.md) and [ARCHITECTURE.md](./ARCHITECTURE.md),
which describes the system as it stands today). Append-only: new entries get
added here as things land, oldest first within each group. Grouped by area
rather than strictly chronological, since most entries here predate this
file and their exact order wasn't recorded at the time; a date is given only
where one was actually noted when the entry was written.

## Code structure & quality

**Extraction.** `template.html` used to mix CSS, markup, and ~450 lines of
JS in a single inline `<script>`. It's now:

```
assets/
  app.js          # extracted client JS — internals unchanged, just relocated
  styles.css      # extracted CSS
lib/
  season_curve.rb # pure bell-curve / temperature-curve generation
  providers/
    open_meteo.rb # live-data fetch, isolated so it's the one thing that
                   # can fail over the network
scripts/
  build_data.rb   # thin orchestrator: calls the lib/ modules, writes outputs
```

(`lib/projection.rb`, originally proposed alongside this, never got built —
the Leaflet migration below removed the map-projection code entirely before
this extraction happened, so there was nothing left to extract.)

`index.html` now references `assets/app.js` and `assets/styles.css` by
`<script src>`/`<link>` instead of inlining them — only the generated JSON
stays inlined. The extraction itself was purely mechanical (`app.js`'s
internals were byte-for-byte the same logic that lived in the inline
`<script>` before); three smaller issues were fixed separately afterward,
not by the move itself:

- `state` is now only ever changed through `setState(patch)`, which merges
  the patch and always calls `refreshAll()` — "changed state but forgot to
  re-render" isn't possible to write anymore. `select(id)` is a one-line
  wrapper (`setState({ selectedId: id })`); the slider handler is one line
  too. `setMode` still directly updates the mode-toggle widget's own visual
  state (active class, `aria-selected`, the slider's `disabled` flag) before
  calling `setState` — that's the widget's own concern, not "does the DOM
  match `state`," so it stayed colocated rather than being forced through
  the same helper. Marker/row selection highlighting moved out of `select()`
  into `refreshAll()` (via `updateSelectionHighlight()`), so it's applied
  consistently on every re-render instead of only when selection itself
  changed — one unified place that makes the DOM match `state`, not two.
- List rows no longer use string-concatenated `innerHTML`. Each row's child
  `<span>`s are created once, when the row itself is built; `renderList()`
  only ever sets their `.textContent` afterward, the same pattern
  `renderDetail()`/`buildDetailSkeleton()` already used for the detail
  panel. No resort-sourced string ever reaches `innerHTML` now — a missed
  closing tag or an HTML-special character in a resort name can't break the
  layout. (`buildDetailSkeleton()`'s own `innerHTML` was left alone: it's
  static markup built once, with no resort data interpolated into it — a
  couple of fixed numeric constants are the only interpolated values — so it
  never carried the risk this was about.)
- `test/theme_tokens_test.rb` asserts the three CSS `:root` blocks (bare,
  `@media (prefers-color-scheme: dark)`, `[data-theme="dark"]`) declare the
  exact same set of custom-property names — not their values, just that
  nothing present in one is silently missing from another. Verified it
  actually catches the failure mode it's meant to: deliberately dropped
  `--temp-warm` from one block and confirmed the test fails with a clear
  "missing: [...]" message naming the exact token and block, then restored
  it. This is the build-time check that was proposed, not the alternative
  (generating all three from one source list) — cheaper to add, and it
  would have caught the actual bug that happened.

One thing the extraction also resolved: `scripts/build_data.rb`'s network
fetch and pure curve computation no longer sit in the same top-to-bottom
script — `Providers::OpenMeteo#fetch` raises a specific error on a
malformed/mismatched response instead of failing obscurely partway through
unrelated code.

## Flexibility — data sources & map

**Provider interface.** `scripts/build_data.rb` doesn't call Open-Meteo
directly; it goes through `Providers.resolve(...).fetch(resorts)`, where
`lib/providers.rb` is a small registry keyed by name (or the
`SNOWPACK_PROVIDER` env var, default `open_meteo`):

```ruby
module Providers
  REGISTRY = { "open_meteo" => OpenMeteo, "fixture" => Fixture }.freeze
  def self.resolve(name = nil)
    name ||= ENV["SNOWPACK_PROVIDER"] || DEFAULT_NAME
    REGISTRY.fetch(name) { raise "Unknown data provider #{name.inspect}..." }.new
  end
end
```

A second provider, `lib/providers/fixture.rb`, reads a captured snapshot
(`data/fixture_conditions.json`) instead of hitting the network — real value
on its own (offline builds, no flaky-connection risk, fast deterministic
runs in CI or locally), not just a proof that the interface works:
`SNOWPACK_PROVIDER=fixture ruby scripts/build_data.rb`. This landed as an
env var rather than the originally-proposed `--provider` CLI flag (simpler,
just as swappable per-environment); a real historical-archive provider or a
`--provider` flag can both slot into the same registry later without
touching `build_data.rb`'s call site.

`data/resorts.json`'s fields were also split into two concerns that used to
be mixed together: resort *facts* (name, region, coordinates, elevation)
live in `data/resorts.json`, and *illustrative-curve tuning knobs*
(`typical_peak_cm`, `typical_min_c`, `typical_edge_c`) live in
`data/illustrative_curve_tuning.json`, keyed by resort id and merged in by
`build_data.rb`. Once real historical data exists for a resort, its tuning
entry just goes away — `resorts.json` itself never needs to change shape for
that transition.

**Map.** `index.html` renders [Leaflet](https://leafletjs.com/) +
OpenStreetMap tiles instead of a baked SVG coastline, with resort
coordinates read straight from `lat`/`lon` — no build-time projection step
at all. This fixed a real problem, not just a cosmetic one: several resorts
(the Nagano/Niigata cluster especially) sat close enough together to
overlap into an unclickable clump on the old static map, with no way to
zoom in and separate them. The Claude Artifact version still runs the old
static-SVG renderer, since its sandbox blocks tile loading — the two
deployments have genuinely diverged, worth remembering if either one gets
touched in isolation.

Two things worth knowing about the implementation: dark mode is a CSS
`invert()` filter on the one OpenStreetMap tile layer rather than a second
"dark" tile provider — a free CartoDB dark-tile endpoint was tried first and
started requiring an API key mid-implementation, exactly the kind of
third-party-dependency risk a second tile source would have carried. And
scroll-wheel zoom is deliberately disabled (the zoom buttons, double-click,
and touch pinch-zoom cover it), since a map that captures the mouse wheel
fights the page's own scrolling.

**Season-constants config file.** Season constants (`season_start`,
`season_end`, `peak_date`, the bell curve's `bell_width`, plus `step_days`)
live in `config/season.json` and get read by `build_data.rb`, which passes
them as keyword arguments into `SeasonCurve.generate`. `lib/season_curve.rb`
itself still defaults those same keywords to its own module constants, so
it stays pure/no-I/O and its unit tests pass unchanged regardless of
whether the config file is present. "Adapt this for a different mountain
range or hemisphere" is a config change, with one caveat worth flagging
honestly: this only covers the *build-time* season curve. The client-side
chart in `assets/app.js` still has its own month labels and a
"mid-February" reference baked in for display purposes, not wired to
`config/season.json` — doing so would need the config exposed to the client
(e.g. embedded in `ski_data.json`), a bigger change left for a future pass
if this ever actually needs to support a Southern Hemisphere resort.

## Testing & quality assurance

**Ruby unit tests.** `test/season_curve_test.rb` and
`test/providers/open_meteo_test.rb`, run via `rake test` (Ruby's bundled
`minitest` and `rake` — nothing to install). Covers exactly the properties
hand-verified once already, by eye, plus the provider's error paths:

- `SeasonCurve.bell` peaks at exactly 1.0 on the peak offset, is symmetric
  around it, and decreases moving away from it.
- `SeasonCurve.temperature_at` hits the edge value at both season
  boundaries, the min value at the peak offset, and clamps rather than
  extrapolating past the season.
- `SeasonCurve.generate`'s output matches known values exactly (54.9cm at
  both season edges, 220.0cm/-12.0°C at the peak, for a Niseko-like resort)
  and never goes negative.
- `Providers::OpenMeteo#fetch` — tested with `Net::HTTP.get` stubbed via
  `Net::HTTP.stub(:get, canned_json) { ... }` (from `minitest/mock`, also
  bundled — no network access needed to run this suite). Covers the happy
  path (unit conversion, rounding, order preserved), and both error paths
  (a too-short response, a non-array error response) raising with a message
  that actually says what went wrong.

At the time this landed, `Providers::OpenMeteo#fetch` was still a plain
method, not yet the swappable provider interface (see Flexibility above) —
the test stubbed `Net::HTTP.get` directly rather than injecting a fake
provider. The provider interface arrived later and would make that cleaner,
but nothing here was blocked on it.

**Client-side JS tests, for the genuinely pure functions.** Two real gaps
got closed:

- `assets/app.js` has a real split: the pure config and functions
  (`hexToRgb`, `lerpColor`, `tempToColor`, `depthToRadius`, `fmtDate`,
  `fmtFetched`, and everything added alongside later features) sit at the
  top of the file, outside any DOM dependency. Everything that touches
  `document`, Leaflet, or `fetch` — including `getDisplay`, which closes
  over `state`/`DATES` — is wrapped in
  `if (typeof document !== 'undefined') { ... }`, and a
  `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }`
  guard at the bottom exports the pure functions. In a browser, `document`
  exists and `module` doesn't, so the page behaves exactly as before
  (byte-identical output verified locally before and after: the same
  `rgb(47,131,224)` for Asahidake at -16°C as was hand-verified earlier). In
  Node, `document` doesn't exist, so the whole DOM-touching block is skipped
  and only the pure functions get defined and exported — no jsdom needed.
- `tempToColor` takes the three temperature-scale colors as parameters
  instead of reading them from CSS via `cssVar()` internally — the smaller
  change, and it cost the browser build nothing: the one call site in
  `renderMarkers()` just passes `cssVar('--temp-cold')` etc. explicitly.

`test/js/app.test.js` covers the exported functions with `node:test`,
including exact-value regression tests for the area-scaling formula and the
squared-easing color fix (`-8°C → rgb(71,134,201)`, matching what was
hand-verified via the browser console earlier). Run via `node --test
test/js`; wired into CI as a second job alongside the Ruby suite.

**CI.** `.github/workflows/test.yml` runs `rake test` on every push and pull
request to `main`, via `ruby/setup-ruby` — no Gemfile needed since
`minitest` and `rake` are both default gems. Fast and network-free, since
the Ruby suite already stubs the one network call. A second job runs `node
--test test/js` the same way, via `actions/setup-node`.

## Data — OpenSkiMap import & licensing

**Licensing of the imported data (2026-09-21).** OpenSkiMap's data derives
from OpenStreetMap and is under the ODbL, whose share-alike condition
applies to the derived data files (the repo is public, so publishing them
is public use). Decided with the owner: label them ODbL and leave the code
MIT. [DATA_LICENSE.md](../DATA_LICENSE.md) lists which files are under
which terms; `ski_data.json` also carries a `data_license` note inside it;
the page footer and README credit OpenSkiData's recommended wording
(OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL),
Skimap.org, Who's On First, © Mapterhorn). Which of the non-OSM sources our
particular fields actually come from wasn't verified, so the full list was
the safe choice. The project is a hobby with no commercial aspirations
(confirmed by the owner), which is what keeps it inside Open-Meteo's free
non-commercial tier: ads or subscriptions would change that. Not legal
advice.

## Docs

**Split `PROPOSALS.md` into three files (2026-09-22).** `PROPOSALS.md` had
grown to 500+ lines doing three jobs at once — roadmap, changelog, and
backlog — flagged as a maintainability concern (see
[PROPOSALS.md](./PROPOSALS.md), "Structure & maintainability"). Split into
this file (the "— done" history, append-only), `ARCHITECTURE.md` (the
system as it stands, unchanged by this split), and a slimmer
`PROPOSALS.md` holding only what's still open.

## UX

**Added a viewport meta tag (2026-09-22).** The page had no
`<meta name="viewport">` at all. Real mobile browsers fall back to
assuming a ~980px-wide page and shrink the whole desktop layout to fit the
physical screen, rather than using the real screen width for CSS — so the
`@media (max-width: 860px)` single-column breakpoint never fired on an
actual phone; the two-column desktop layout just rendered tiny instead.
Found by the first run of the UX-specialist review (see
[UX_FINDINGS.md](./UX_FINDINGS.md) for the workflow), and confirmed
directly with a real mobile user agent at 375px width before fixing it:
`window.innerWidth` read 980 and the grid stayed two-column (529px/391px)
before, 378 and one column (358px) after. Manually narrowing a desktop
browser window doesn't reproduce this — desktop browsers always use the
real window width, which is why the bug went unnoticed despite the
responsive CSS (chip wrapping, list height cap) already being in place.

**Fixed keyboard Tab order over the map markers (2026-09-22).** The
[major] finding from the same review: Tab order over the ~27-477 markers
didn't follow anything meaningful (region, the list order, geography) — it
bounced between regions with no pattern. Root cause: `renderMarkers()`
called `m.bringToFront()` (a real DOM move in Leaflet's SVG renderer)
whenever a marker went from not-active to active, which fires on
essentially every marker's first activation. DOM/Tab order ended up as
"whichever markers most recently activated, in whichever order
`renderMarkers` iterated them" — `data/resorts.json`'s raw storage order —
and could reshuffle again on the next filter/zoom/search/ranking change.
Fixed by separating Tab order from paint order: markers are now created
once, in a new shared `sortResorts()` order (region, then largest first —
the same order the resort list already uses, so map Tab order now matches
what a sighted user reads in the list), and instead of moving individual
markers on every state change, `renderMarkers()` does one full, sorted
restack every render — every currently-dim marker first, then every
currently-active marker, both in that same fixed order — so "active draws
over dim" still holds, but DOM order is always this one stable, meaningful
order rather than recency-dependent. Verified the fix actually addresses
the reported bug, not just a symptom: reverted to the exact original
`renderMarkers()` and confirmed two new automated checks (DOM/Tab order
compared against an independently-computed expected order, both at initial
load and after a run of filter/ranking/mode changes) correctly fail against
it, then pass again once reverted back.

**Fixed the Top-10 ranking status dropping its "why" explanation
(2026-09-22).** The other [major] finding: the non-ranking status line
explains *why* the candidate pool is only 27 of 477 resorts ("... hidden in
Typical season mode; switch to Live now to see them"), but activating a
ranking replaced that with a bare "Top 10 highest altitude of 27 resorts,"
dropping the one sentence that explains the count right when it mattered
most. `rankingStatus()` simply never included it. Fixed by appending the
same sentence there too.

**Investigated, could not reproduce: stale Top-10 rank badges after
"Clear filters" (2026-09-22).** The UX review's third [major] finding
described rank-number badges persisting on resort rows after clearing an
active ranking. Traced the relevant code (`placeRankedRows`/
`restoreRowsToGroups`) and found nothing that could produce that: clearing
unconditionally hides every row's badge. Reproduced neither the literal
2-step repro from the report nor a longer multi-ranking/search/clear
sequence, twice each, against the unmodified code. The reported badge
numbers exactly matched a live "Highest altitude" result, which points at
the reviewing agent's own script having read page state before its "Clear
filters" click had actually taken effect, rather than a real persistence
bug. No code change made. Recorded here (rather than silently dropped) so
a future review doesn't re-flag the same non-bug without this context.
