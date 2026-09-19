# Improvement proposals

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), which describes the system
as it stands. Started as an all-proposed wishlist; items get marked done in
place as they land, so this doubles as a running log of what changed and why.
Each section is ordered roughly quick-win-first.

## 1. Code structure & quality

**Extraction — done.** `template.html` used to mix CSS, markup, and ~450
lines of JS in a single inline `<script>`. It's now:

```
assets/
  app.js          # extracted client JS — internals unchanged, just relocated
  styles.css      # extracted CSS
lib/
  season_curve.rb # pure bell-curve / temperature-curve generation
  providers/
    open_meteo.rb # live-data fetch, isolated so it's the one thing that
                   # can fail over the network (not yet a swappable
                   # "pick a provider" interface — that's §2)
scripts/
  build_data.rb   # thin orchestrator: calls the two lib/ modules, writes outputs
```

(`lib/projection.rb`, originally proposed here, never got built — the
Leaflet migration in §2 removed the map-projection code entirely before this
extraction happened, so there was nothing left to extract.)

`index.html` now references `assets/app.js` and `assets/styles.css` by
`<script src>`/`<link>` instead of inlining them — only the generated JSON
stays inlined. The extraction itself was purely mechanical (`app.js`'s
internals were byte-for-byte the same logic that lived in the inline
`<script>` before), and left the three smaller issues below exactly as open
as they'd been — they were fixed separately afterward, not by the move
itself.

**The three smaller issues — all done:**

- `state` is now only ever changed through `setState(patch)`, which merges
  the patch and always calls `refreshAll()` — "changed state but forgot to
  re-render" isn't possible to write anymore. `select(id)` is now a one-line
  wrapper (`setState({ selectedId: id })`); the slider handler is one line
  too. `setMode` still directly updates the mode-toggle widget's own visual
  state (active class, `aria-selected`, the slider's `disabled` flag) before
  calling `setState` — that's the widget's own concern, not "does the DOM
  match `state`," so it stayed colocated rather than being forced through
  the same helper. Marker/row selection highlighting moved out of `select()`
  into `refreshAll()` (via `updateSelectionHighlight()`), so it's now applied
  consistently on every re-render instead of only when selection itself
  changed — one unified place that makes the DOM match `state`, not two.
- List rows no longer use string-concatenated `innerHTML`. Each row's four
  child `<span>`s are created once, when the row itself is built;
  `renderList()` only ever sets their `.textContent` afterward, the same
  pattern `renderDetail()`/`buildDetailSkeleton()` already used for the
  detail panel. No resort-sourced string ever reaches `innerHTML` now — a
  missed closing tag or an HTML-special character in a resort name can't
  break the layout. (`buildDetailSkeleton()`'s own `innerHTML` was left
  alone: it's static markup built once, with no resort data interpolated
  into it — CHART_W/CHART_H are the only interpolated values, both fixed
  numeric constants — so it never carried the risk this was about.)
- `test/theme_tokens_test.rb` now asserts the three `:root` blocks (bare,
  `@media (prefers-color-scheme: dark)`, `[data-theme="dark"]`) declare the
  exact same set of custom-property names — not their values, just that
  nothing present in one is silently missing from another. Verified it
  actually catches the failure mode it's meant to: deliberately dropped
  `--temp-warm` from one block and confirmed the test fails with a clear
  "missing: [...]" message naming the exact token and block, then restored
  it. This is the build-time check proposed here, not the alternative
  (generating all three from one source list) — cheaper to add, and it
  would have caught the actual bug that happened.

One thing the extraction *did* resolve: `scripts/build_data.rb`'s network
fetch and pure curve computation no longer sit in the same top-to-bottom
script — `Providers::OpenMeteo#fetch` now raises a specific error on a
malformed/mismatched response instead of failing obscurely partway through
unrelated code. There's still no rescue/retry around it, but there's now an
obvious, isolated place to add one.

## 2. Flexibility — data sources & map

**Data sources — done.** `scripts/build_data.rb` no longer calls Open-Meteo
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
`SNOWPACK_PROVIDER=fixture ruby scripts/build_data.rb`. This is one
concrete step short of the original proposal's `--provider` flag idea (an
env var was simpler and just as swappable per-environment); a real
historical-archive provider or a `--provider` CLI flag both slot into the
same registry later without touching `build_data.rb`'s call site.

`data/resorts.json`'s fields are now also split into the two concerns that
used to be mixed together: resort *facts* (name, region, coordinates,
elevation) live in `data/resorts.json`, and *illustrative-curve tuning
knobs* (`typical_peak_cm`, `typical_min_c`, `typical_edge_c`) live in
`data/illustrative_curve_tuning.json`, keyed by resort id and merged in by
`build_data.rb`. Once real historical data exists for a resort, its tuning
entry just goes away — `resorts.json` itself never needs to change shape
for that transition.

**Map — done.** `index.html` (the GitHub Pages version) now renders
[Leaflet](https://leafletjs.com/) + OpenStreetMap tiles instead of a baked
SVG coastline, with resort coordinates read straight from `lat`/`lon` — no
more build-time projection step at all. This fixed a real problem, not just
a cosmetic one: several resorts (the Nagano/Niigata cluster especially) sat
close enough to overlap into an unclickable clump on the old static map, and
there was no way to zoom in and separate them. The Claude Artifact version
still runs the old static-SVG renderer, since its sandbox still blocks tile
loading — the two deployments have now genuinely diverged, worth remembering
if either one gets touched in isolation.

Two things worth knowing about the implementation: dark mode is a CSS
`invert()` filter on the one OpenStreetMap tile layer rather than a second
"dark" tile provider — a free CartoDB dark-tile endpoint was tried first and
started requiring an API key mid-implementation, which is exactly the
third-party-dependency risk this section originally warned about. And
scroll-wheel zoom is deliberately disabled (the zoom buttons, double-click,
and touch pinch-zoom cover it) since a map that captures the mouse wheel
fights the page's own scrolling.

Smaller flexibility win — done. Season constants (`season_start`,
`season_end`, `peak_date`, the bell curve's `bell_width`, plus `step_days`)
now live in `config/season.json` and get read by `build_data.rb`, which
passes them as keyword arguments into `SeasonCurve.generate`.
`lib/season_curve.rb` itself still defaults those same keywords to its own
module constants, so it stays pure/no-I/O and its existing unit tests keep
passing unchanged regardless of whether the config file is present. "Adapt
this for a different mountain range or hemisphere" is now a config change,
with one caveat worth flagging honestly: this only covers the *build-time*
season curve. The client-side chart in `assets/app.js` still has its own
month labels and a "mid-February" reference baked in for display purposes,
and those were not wired to `config/season.json` — doing so would need the
config to be exposed to the client (e.g. embedded in `ski_data.json`), which
is a bigger change than "pull constants into a file" and is left for a
future pass if this ever actually needs to support a Southern Hemisphere
resort.

## 3. Testing & quality assurance

**a) `scripts/build_data.rb`'s computation — done.** `test/season_curve_test.rb`
and `test/providers/open_meteo_test.rb` exist, run via `rake test` (Ruby's
bundled `minitest` and `rake` — nothing to install). 15 tests, 77 assertions,
covering exactly the properties hand-verified once already, by eye,
mid-conversation, plus the provider's error paths:

- `SeasonCurve.bell` peaks at exactly 1.0 on the peak offset, is symmetric
  around it, and decreases moving away from it.
- `SeasonCurve.temperature_at` hits the edge value at both season boundaries,
  the min value at the peak offset, and clamps rather than extrapolating
  past the season.
- `SeasonCurve.generate`'s output matches the known values from earlier in
  the project exactly (54.9cm at both season edges, 220.0cm/-12.0°C at the
  peak, for a Niseko-like resort) and never goes negative.
- `Providers::OpenMeteo#fetch` — tested with `Net::HTTP.get` stubbed via
  `Net::HTTP.stub(:get, canned_json) { ... }` (from `minitest/mock`, also
  bundled — no network access needed to run this suite). Covers the happy
  path (unit conversion, rounding, order preserved), and both error paths
  (a too-short response, a non-array error response) raising with a message
  that actually says what went wrong.

`Providers::OpenMeteo#fetch` is still a plain method, not yet the swappable
"pick a provider" interface proposed in §2 — the test stubs `Net::HTTP.get`
directly rather than injecting a fake provider. §2's fuller interface would
make that cleaner, but nothing here was blocked on it.

**b) The client-side JS — done, for the genuinely pure functions.**
The two real gaps identified here have both been closed:

- `assets/app.js` now has a real split: the pure config and functions
  (`hexToRgb`, `lerpColor`, `tempToColor`, `depthToRadius`, `fmtDate`,
  `fmtFetched`) sit at the top of the file, outside any DOM dependency.
  Everything that touches `document`, Leaflet, or `fetch` — including
  `getDisplay`, which closes over `state`/`DATES` — is now wrapped in
  `if (typeof document !== 'undefined') { ... }`, and a
  `if (typeof module !== 'undefined' && module.exports) { module.exports = {...} }`
  guard at the bottom exports the pure functions. In a browser, `document`
  exists and `module` doesn't, so the page behaves exactly as before (byte-
  identical output verified locally before and after: the same
  `rgb(47,131,224)` for Asahidake at -16°C as was hand-verified earlier).
  In Node, `document` doesn't exist, so the whole DOM-touching block is
  skipped and only the pure functions get defined and exported — no jsdom
  needed.
- `tempToColor` takes the three temperature-scale colors as parameters now
  instead of reading them from CSS via `cssVar()` internally — the smaller
  change, as expected, and it cost the browser build nothing: the one call
  site in `renderMarkers()` just passes `cssVar('--temp-cold')` etc.
  explicitly.

`test/js/app.test.js` covers all six exported functions with `node:test` —
17 tests, including the exact-value regression tests for the area-scaling
formula and the squared-easing color fix (`-8°C → rgb(71,134,201)`, matching
what was hand-verified via the browser console earlier in the project).
Run via `node --test test/js`; wired into CI as a second job alongside the
Ruby suite.

`getDisplay` is not covered — it closes over `state`/`DATES`/`DATA`, which
only exist inside the DOM-guarded section, so testing it would mean either
injecting that state explicitly (a real refactor, not just an export) or a
DOM shim. Not done here; a reasonable next step if this suite grows.

For anything that touches the DOM directly (do 20 markers render, does
clicking one update the detail panel, does the mode toggle disable the
slider), a headless-browser smoke test (Playwright is the common choice)
driving the built `index.html` would catch regressions a pure-function test
can't. Still a heavier lift, still a phase-2 item.

**c) CI — done.** `.github/workflows/test.yml` runs `rake test` on every push
and pull request to `main`, via `ruby/setup-ruby` — no Gemfile needed since
`minitest` and `rake` are both default gems. Fast and network-free, same as
running it locally, since §3a's suite already stubs the one network call.
Once §3b's JS tests exist, add a second job (or step) to the same workflow
rather than a new one. This can also share infrastructure with the
daily-snapshot workflow already proposed in the README: the same repo ends
up with one scheduled workflow that fetches real data and one on-push
workflow that runs tests against mocked data.

**d) Manual/visual QA.** Some things are impractical to fully automate —
color legibility in both light and dark mode, chart label collisions, mobile
layout. Worth writing down the checklist we effectively followed by hand in
this conversation (screenshot + a few targeted `getAttribute`/console checks
against the known-correct formulas) as a short, repeatable
`docs/QA_CHECKLIST.md`, so it doesn't depend on remembering to do it.

## Suggested order

Grouped by the chapter it belongs to above, so the numbering here doesn't
collide with the §1/§2/§3 chapter references used throughout this doc.

**§1 Code structure & quality**
1. ~~Extract CSS/JS out of `template.html`~~ — done.
2. ~~The three smaller issues~~ (`state` mutation, `innerHTML` fragility,
   CSS-drift protection) — done.

**§2 Flexibility — data sources & map**
1. ~~Leaflet map~~ — done.
2. ~~Provider interface~~ — done: `lib/providers.rb` registry, plus a real
   second provider (`lib/providers/fixture.rb`) for offline builds.
3. ~~Season-constants config file~~ — done: `config/season.json`.

**§3 Testing & quality assurance**
1. ~~Ruby unit tests (§3a)~~ — done: `rake test`, 15 tests, 77 assertions.
2. ~~JS test exports (§3b)~~ — done: `node --test test/js`, 17 tests, for
   the genuinely pure functions (`getDisplay` still isn't reachable — see §3b).
3. ~~CI (§3c)~~ — done: `.github/workflows/test.yml` runs both suites (a
   `test-ruby` job and a `test-js` job) on every push/PR to `main`.

All three items in this chapter are done, except the manual QA checklist
(§3d) and the headless-browser smoke test mentioned in §3b, neither of which
were tracked here as numbered items.

§1 and §2 are fully done now. Left in §3: the manual QA checklist (§3d) and
the headless-browser smoke test mentioned in §3b.

Let me know which of these you'd like implemented first — happy to start
with any one in isolation.

## Backlog / to consider

Smaller open items, mostly raised while adding the ~450 OpenSkiMap resorts
(branch `more-resorts`). None blocks anything; they're here so they don't get
lost.

**Rethink the typical-season curves.** Asked for explicitly. Today they're a
synthetic bell curve per resort, driven by three hand-set numbers in
`data/illustrative_curve_tuning.json`. Only ~27 resorts have one (every
`major` resort; everything smaller is live-only by design). Two things to look
at:
- The 7 entries added with the import (Tsugaike, Takasu, Sahoro, Nekoma,
  Joetsu, Tomamu, Hakuba Iwatake) are **my rough estimates by analogy to
  neighbouring curated resorts**, not sourced numbers. Worth checking against
  something real before anyone relies on them.
- A real replacement would compute a per-resort, day-of-year median from
  historical data (worth checking whether Open-Meteo's historical/archive
  API offers snow depth at useful quality for mountain terrain; the daily-
  snapshot Action in the README is the other route). That would retire the
  tuning knobs and could give *every* resort a curve, not just the big ones.
  The same terrain-resolution caveat that applies to the live numbers would
  apply here.

**Resort names and duplicates.** Deliberately deferred. Names are OpenSkiMap's,
lightly cleaned (first English part, macrons folded, parentheticals dropped).
Known rough edges: one resort has only a Japanese name
(`osm_812dcf8b`, Grand Sunpia Inawashiro); two areas are both called "Manza
Onsen" (ids `manza_onsen`, `manza_onsen_gunma`); and only Shiga Kogen has
its OpenSkiMap sub-areas merged into one resort. Other places OpenSkiMap
splits what visitors think of as one destination: the Naeba / Tashiro /
Kagura / Mitsumata group, Myoko's several resorts, Niseko Moiwa (listed
separately from Niseko United). Search also only matches English names, so
typing a resort's Japanese name finds nothing.

**Licensing of the imported data.** OpenSkiMap's data is derived from
OpenStreetMap and released under the ODbL, which has a share-alike condition
for derived databases; the repo's MIT license covers the code, not that data.
Attribution is in place (the map's attribution line and the README's data
sources). Whether `data/resorts.json` / `ski_data.json` should be labelled as
ODbL is worth a deliberate decision — I'm not a lawyer and haven't made it
for you.

**Tier thresholds and zoom levels are first guesses.** `MAJOR_MIN_KM = 20` and
`MEDIUM_MIN_KM = 8` in `lib/openskimap_import.rb`, and `TIER_MIN_ZOOM`
(medium 6, small 8) in `assets/app.js`. Some resorts people would call
notable land in `medium` and so have no typical-season curve: Ontake 2240
(top elevation 2,215 m, the highest of any resort outside the major tier), Kamui Ski Links, Aomori
Spring, Shizukuishi, Palcall Tsumagoi. Promoting one is a tier edit in
`resorts.json` plus a tuning entry.

**Live-refresh call budget.** Open-Meteo's free tier is metered per location
(5,000/hour, 10,000/day). The page only refreshes what's on screen, once per
resort per page view, which keeps a normal visit to a few hundred calls. If
traffic grows, the daily-snapshot workflow (README, Next steps) would let
browsers skip most of those calls.

**Smaller things.**
- ~40 resorts have no known top elevation (OpenSkiMap has no run/lift data
  for them); the UI shows a dash.
- Filters and the list card were checked at desktop width only; the small-
  screen layout (chips wrapping, list capped at 70vh) hasn't been looked at
  on a real phone.
- Filter state isn't in the URL, so a filtered view can't be shared.
- All ~480 markers are SVG paths, which is fine at this size and is what
  gives us keyboard/ARIA hooks; a Canvas renderer would only matter if the
  count grew a lot.
