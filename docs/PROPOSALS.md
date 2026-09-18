# Improvement proposals

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md), which describes the system
as it stands. This document proposes changes — none of it is implemented yet.
Each section is ordered roughly quick-win-first.

## 1. Code structure & quality

**Everything lives in one 798-line file.** `template.html` mixes CSS, markup,
and ~450 lines of JS in a single inline `<script>`. Nothing is unit-testable
without extracting it, and unrelated changes (say, a color tweak vs. a chart
layout change) touch the same file.

Proposed target layout:

```
assets/
  app.js          # extracted client JS (see below)
  styles.css      # extracted CSS
lib/
  projection.rb   # pure map-projection math
  season_curve.rb # pure bell-curve / temperature-curve generation
  providers/
    open_meteo.rb # live-data fetch, isolated behind a small interface
scripts/
  build_data.rb   # thin orchestrator: calls lib/* in order, writes outputs
```

`index.html` would then be a small shell that references `assets/app.js` and
`assets/styles.css` by `<script src>`/`<link>` rather than inlining them —
only the generated JSON stays inlined, since that's the one thing that has to
travel with the page. This is also a prerequisite for real unit testing (§3).

**Other concrete issues, smaller but worth fixing alongside the above:**

- `state` is a bare mutable object mutated from several places
  (`select`, `setMode`, the slider's `input` handler), each remembering to
  call `refreshAll()` afterward. It works today but is easy to get wrong as
  more state is added (e.g., a future map-provider toggle). Worth wrapping in
  a single `setState(patch)` helper that always re-renders, so "forgot to
  refresh" stops being a possible bug.
- List rows and the detail-panel skeleton are built with string-concatenated
  `innerHTML`. Fine for now since all data is self-generated, but fragile to
  edit (a missed closing tag silently breaks layout) and would need real
  escaping if resort data ever came from an untrusted source. Small template
  helper functions (or just `textContent` assignment to pre-built nodes, as
  the map markers already do) would remove the risk entirely.
- The three copies of the CSS custom-property block (light `:root`, dark via
  `@media`, dark via `[data-theme]`) are correct per the theming approach but
  easy to let drift — we hit exactly this bug mid-conversation (updated two
  of three blocks, the third was caught by `grep`). A small build-time check
  (or generating all three from one source list) would catch that class of
  mistake automatically instead of by accident.
- `scripts/build_data.rb` is one top-to-bottom script: network fetch,
  projection math, and curve generation are interleaved, and there's no error
  handling around the HTTP call — a network hiccup or malformed API response
  raises an unhandled exception mid-script. Splitting into the `lib/` modules
  above isolates the parts that can fail (network) from the parts that are
  pure computation (projection, curves), and gives each its own place to add
  a rescue/retry.

## 2. Flexibility — data sources & map

**Data sources.** `scripts/build_data.rb` calls Open-Meteo directly, with the
URL construction and response parsing inline in the main script. Swapping in
a second source (JMA, a paid provider, or a future "historical archive"
reader) currently means editing that logic in place.

Proposed: a small provider interface —

```ruby
# lib/providers/open_meteo.rb
module Providers
  class OpenMeteo
    def fetch(resorts)
      # returns [{ id:, snow_depth_cm:, temperature_c: }, ...]
    end
  end
end
```

`build_data.rb` would take a provider instance (selected by a config value or
`--provider` flag) and call `.fetch(resorts)` without knowing which service
answered. This makes three things easy that are currently hard: adding a
second live source, swapping providers per-environment (e.g., a stub provider
in tests — see §3), and later layering in a real historical-archive provider
once the daily-snapshot GitHub Action (mentioned in the README) exists.

Also worth splitting `data/resorts.json`'s fields into two concerns that are
currently mixed together: resort *facts* (name, region, coordinates,
elevation) versus *illustrative-curve tuning knobs* (`typical_peak_cm`,
`typical_min_c`, `typical_edge_c`). Once real historical data exists, the
tuning knobs stop being needed for resorts that have it — separating them now
means that transition doesn't require reshaping the resort list itself.

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

Smaller flexibility win, still open: season constants (`season_start`,
`season_end`, `peak_date`, the bell curve's `width`) are hardcoded in
`build_data.rb`. Pulling them into a small `config.json` would make
"adapt this for a different mountain range or
hemisphere" a config change instead of a code change.

## 3. Testing & quality assurance

There are currently zero automated tests. Two different things need covering:

**a) `scripts/build_data.rb`'s computation.** Once the pure functions
(projection, bell curve, temperature curve) live in `lib/` as proposed in
§1, they're testable with Ruby's built-in `minitest` — no gems to install.
Concretely, these are exactly the properties we hand-verified once already,
by eye, mid-conversation — worth locking in as tests instead of re-checking
by hand every time:

```ruby
# spec/season_curve_spec.rb (illustrative)
assert_equal typical_peak_cm, bell(peak_offset, peak_offset) * typical_peak_cm
assert_equal typical_edge_c, temp_curve.first[1]   # season start ≈ mild
assert_equal typical_min_c,  temp_curve_at(peak_offset)  # trough at peak
```

The network call should sit behind the provider interface from §2 so tests
can inject a canned response instead of hitting Open-Meteo — faster, and CI
doesn't need network access for this suite.

**b) The client-side JS.** Once the pure functions (`tempToColor`,
`depthToRadius`, `hexToRgb`, `lerpColor`, `fmtDate`, `getDisplay`) are
extracted to `assets/app.js` per §1, they can be tested directly with Node's
built-in `node:test` + `node:assert` — again, no install, since they don't
touch the DOM. This covers the same math already spot-checked by hand via the
browser console during development: the radius floor and area-scaling curve,
the exact interpolated RGB values at known temperatures, and the ≤0.05cm
hollow-ring threshold.

For anything that *does* touch the DOM (do 20 markers render, does clicking
one update the detail panel, does the mode toggle disable the slider), a
headless-browser smoke test (Playwright is the common choice) driving the
built `index.html` would catch regressions a pure-function test can't. This
is a heavier lift than (a) and (b) — worth treating as a phase-2 item rather
than blocking on it.

**c) CI.** A `.github/workflows/test.yml` running the Ruby suite (and the JS
suite, once it exists) on every push/PR — fast, no network needed since the
fetch is mocked. This can share infrastructure with the daily-snapshot
workflow already proposed in the README: the same repo ends up with one
scheduled workflow that fetches real data and one on-push workflow that
runs tests against mocked data.

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
1. Extract CSS/JS out of `template.html` — the one item other chapters
   depend on (§3b needs it).

**§2 Flexibility — data sources & map**
1. ~~Leaflet map~~ — done.
2. Introduce the provider interface — needed before a second data source or
   the historical-archive workflow makes sense.
3. Season-constants config file — no dependency, do whenever it's useful.

**§3 Testing & quality assurance**
1. Ruby unit tests for the already-verified math (§3a) — cheap, immediate
   regression protection, no dependency on anything else.
2. JS unit tests (§3b) — blocked on §1's extraction above.
3. CI (§3c) — do once §2's provider interface or the daily-snapshot workflow
   gives it something concrete to run against.

If picking just one place to start: §1's extraction, since it's the only
item blocking something else (§3b).

Let me know which of these you'd like implemented first — happy to start
with any one in isolation.
