# Improvement proposals

Only what's still open lives here. Two companion docs:
[ARCHITECTURE.md](./ARCHITECTURE.md) describes the system as it stands, and
[CHANGELOG.md](./CHANGELOG.md) has the "— done" history this file used to
carry inline (split out 2026-09-22, once that history made the file too big
to use as a quick "what's left" reference). When something below ships, move
its write-up to `CHANGELOG.md` rather than marking it done in place.

## Testing gaps

Two things `rake test` / `node --test test/js` don't reach:

- **DOM-touching code isn't unit-tested.** `getDisplay` closes over
  `state`/`DATES`/`DATA`, which only exist inside `assets/app.js`'s
  DOM-guarded section, so testing it means either injecting that state
  explicitly (a real refactor, not just an export) or a DOM shim. Neither
  has been done. More broadly, nothing verifies markers actually render,
  clicking one actually updates the detail panel, or the mode toggle
  actually disables the slider — `test/browser/*.js` does check exactly
  these things by driving the real page, but only when run by hand; see
  "Structure & maintainability" below for wiring it into CI, which would
  close this gap too.
- **No written manual/visual QA checklist.** Some things are impractical to
  fully automate — color legibility in both light and dark mode, chart
  label collisions, mobile layout. There's an informal checklist that's
  been followed by hand repeatedly (screenshot + a few targeted
  `getAttribute`/console checks against the known-correct formulas); it's
  never been written down as a repeatable `docs/QA_CHECKLIST.md`, so it
  depends on remembering to do it.

## Forecast — a snow forecast view, and a forecast-based Top 10

Proposed by the owner (2026-09-22), building on the Live/Typical season
split and the Top-10 rankings: a third data mode showing what's *expected*,
not just what's now or what's typical.

**a) A snow forecast view.** Open-Meteo's forecast endpoint (the same one
the live refresh already calls) has a free `daily=snowfall_sum` field, up
to 16 days out — confirmed against the live API while writing this
proposal, so this is buildable with no new data source:

```
GET /v1/forecast?latitude=...&longitude=...&daily=snowfall_sum&forecast_days=10
```

The natural home is a third mode alongside "Live now" / "Typical season" —
call it "10-day forecast" — with the date slider replaced by a day picker
(or kept, scrubbing the 10 forecast days instead of the illustrative
season). Marker size would show forecast snowfall for the selected day (a
rate, not the season's cumulative depth, so the color/size legend needs a
forecast-mode label change). The detail chart gets a third series option:
today's forecast sits oddly next to a fixed illustrative curve, so probably
a separate small chart rather than a third line on the existing one.

**b) A Top-10 "most snow coming" list**, using `rankResorts`/`classifyResort`
(same pattern as the two existing Top-10 lists), ranked by total forecast
snowfall over the next N days (N=10 to match the title, but worth exposing
as a parameter — a "next 3 days" view answers a different question than
"next 10 days"). Depends on (a) existing, since the ranking needs the same
per-resort daily series the view renders.

**Sizing this against the two rankings already shipped:**

- **New network shape.** The live refresh fetches one `current` value per
  resort; this needs a `daily` array of 10 values per resort. Same batching
  approach (100 locations/request), but roughly 10x the response payload
  per resort — worth checking real response sizes at ~480 resorts before
  assuming batch-of-100 is still the right size.
- **A forecast is not "on screen right now."** The existing rankings lean
  on "only resorts currently visible or already fetched, once per page
  view." A national "most snow coming" ranking needs a forecast for every
  eligible resort the moment it's opened, the same shape of problem the
  snow ranking already solved (`isRankingReady`), but for ~480 resorts on
  first open rather than only the visible ones — call volume is closer to
  the build script's than to the live-refresh's.
- **Forecast skill decays with lead time.** A 10-day snow forecast is far
  less reliable at day 9 than day 1, and worth saying so in the UI (a
  confidence note, or shading later days differently) rather than
  presenting all 10 days with equal weight.
- **Same terrain-resolution caveat as live data** (documented in
  DATA_LICENSE.md / README): Open-Meteo's model grid doesn't resolve
  individual mountains, so neighbouring resorts can get near-identical
  forecasts. This affects the Top-10's tie-breaking the same way the live
  snow ranking already handles it.
- **Off-season is genuinely different here.** The live/typical-season split
  hides live-only resorts outside winter because the *values* are boring
  (0cm), but the forecast is still meaningful in September — it would
  correctly show near-zero forecast snowfall, not stale data. Worth
  deciding whether "10-day forecast" mode should hide itself off-season
  like Typical season implicitly does, or just show truthfully-small
  numbers.

Not started. Medium-sized relative to the two shipped Top-10 lists: the
ranking and UI patterns transfer directly, but the network shape (multi-day
arrays, fetch-everything-up-front) is new.

## Structure & maintainability

Prompted by the owner (2026-09-22) asking for an assessment of the codebase
now that it's grown well past its original size. Grounded in the actual
numbers, not a general feeling:

| | |
|---|---|
| `assets/app.js` | 1,199 lines, ~73 functions, one closure |
| — inside the DOM-guarded block | ~950 lines: map, list, filters, rankings, chart, live-fetch, all sharing module-level state |
| — exported (unit-testable) functions | 21 |
| `data/resorts.json` | 477 records, no schema — validity is implicit across several test files |
| `test/browser/*.js` | 228 lines of real, working browser tests — 0 of them run in CI |

**What's still holding up.** The pure/DOM split in `app.js` (the
`typeof document !== 'undefined'` guard) has survived three feature rounds
without erosion — every addition (tiers, filters, rankings) exported its
logic the same way the original code did. `lib/providers.rb`,
`lib/season_curve.rb` and `lib/openskimap_import.rb` are still small,
single-purpose, and independently tested. `test/region_consistency_test.rb`
is a good model of the kind of test this section asks for more of: it
cross-checks independent sources of truth (the Ruby importer, `app.js`, the
CSS, the real data) instead of trusting them to stay in sync by convention.

**a) Split `assets/app.js` into ES modules along its existing section
boundaries** (map, list, filters, rankings, chart, live-fetch, plus one
shared pure-logic module) using native `<script type="module">` — no
bundler, so `ARCHITECTURE.md`'s "no build step" property stays true. This is
the highest-leverage item here: it turns the section comments (`// ----
filters ----`, etc.) into real boundaries instead of honesty-system ones,
and it lets the pure-logic module be imported directly by both the browser
and the Node tests, retiring the `module.exports` guard at the bottom of
the file.

**b) Wire the browser checks into CI.** `test/browser/ranking_check.js`
drives the real page against a mocked winter and checks the rendered DOM
against an independently-computed expected result — it's a real regression
test, but right now it only runs when someone happens to run it by hand in
a browser. A `test-browser` CI job (a headless browser — Playwright is the
standard choice — loading `tmp/debug.html?winter` and failing the build on
`failed > 0`) would close that, and the DOM-coverage gap noted under
"Testing gaps" above. Worth deciding explicitly rather than adding
silently: this is the project's first npm dependency, even if it's
dev/CI-only and `node --test test/js` stays zero-install.

**c) Add a test tying `import_openskimap.rb`'s `MATCHERS` table to
`data/resorts.json`'s real ids.** The 20 curated resort ids are hardcoded
twice today — once as data, once as regex-matched `MATCHERS` keys — and
nothing but a `STDERR` warning at import time notices if they drift apart.
The resort-name-cleanup backlog item below would be exactly the kind of
change that causes that drift. One assertion (`MATCHERS.keys` is a subset
of the curated ids) closes it. Small.

**d) A minimal schema/validator for `data/resorts.json`** — required
fields, types, id format — as one Ruby test, rather than the shape being
implicit across `region_consistency_test.rb` and whatever else happens to
assert on it. Small.

None of this is urgent: nothing here is a bug, and the app works. It's a
"the next 500 lines will be more expensive than the last 500 were"
observation, mostly (a) and (b).

## Backlog / to consider

Smaller open items, mostly raised while adding the ~450 OpenSkiMap resorts
(branch `more-resorts`). None blocks anything; they're here so they don't
get lost.

**Rethink the typical-season curves.** Asked for explicitly. Today they're a
synthetic bell curve per resort, driven by three hand-set numbers in
`data/illustrative_curve_tuning.json`. Only ~27 resorts have one (every
`major` resort; everything smaller is live-only by design). Two things to
look at:
- The 7 entries added with the import (Tsugaike, Takasu, Sahoro, Nekoma,
  Joetsu, Tomamu, Hakuba Iwatake) are **rough estimates by analogy to
  neighbouring curated resorts**, not sourced numbers. Worth checking
  against something real before anyone relies on them.
- A real replacement would compute a per-resort, day-of-year median from
  historical data (worth checking whether Open-Meteo's historical/archive
  API offers snow depth at useful quality for mountain terrain; the
  daily-snapshot Action in the README is the other route). That would
  retire the tuning knobs and could give *every* resort a curve, not just
  the big ones. The same terrain-resolution caveat that applies to the live
  numbers would apply here.

**Resort names and duplicates.** Deliberately deferred. Names are
OpenSkiMap's, lightly cleaned (first English part, macrons folded,
parentheticals dropped). Known rough edges: one resort has only a Japanese
name (`osm_812dcf8b`, Grand Sunpia Inawashiro); two areas are both called
"Manza Onsen" (ids `manza_onsen`, `manza_onsen_gunma`); and only Shiga
Kogen has its OpenSkiMap sub-areas merged into one resort. Other places
OpenSkiMap splits what visitors think of as one destination: the Naeba /
Tashiro / Kagura / Mitsumata group, Myoko's several resorts, Niseko Moiwa
(listed separately from Niseko United). Search also only matches English
names, so typing a resort's Japanese name finds nothing.

**Tier thresholds and zoom levels are first guesses.** `MAJOR_MIN_KM = 20`
and `MEDIUM_MIN_KM = 8` in `lib/openskimap_import.rb`, and `TIER_MIN_ZOOM`
(medium 6, small 8) in `assets/app.js`. Some resorts people would call
notable land in `medium` and so have no typical-season curve: Ontake 2240
(top elevation 2,215 m, the highest of any resort outside the major tier),
Kamui Ski Links, Aomori Spring, Shizukuishi, Palcall Tsumagoi. Promoting one
is a tier edit in `resorts.json` plus a tuning entry.

**Live-refresh call budget.** Open-Meteo's free tier allows 600/minute,
5,000/hour and 10,000/day *per IP* (so each visitor has their own budget,
except behind shared IPs). Whether a multi-location request counts as one
call or one per location isn't documented anywhere that could be found. The
page is built for the worse case: it refreshes only what's on screen, once
per resort per page view, ~30-140 locations per action. If it turns out to
be one call per request, this is over-cautious but harmless. If traffic
grows, or the site ever carries ads or subscriptions (which makes it
"commercial" under Open-Meteo's terms and needs a paid plan), the
daily-snapshot workflow (README, Next steps) would let browsers skip most
of those calls. That workflow would run from GitHub's shared runner IPs,
and Open-Meteo's creator has noted the per-IP limits are awkward for shared
hosting, so it's worth testing before relying on it.

**Smaller things.**
- ~40 resorts have no known top elevation (OpenSkiMap has no run/lift data
  for them); the UI shows a dash.
- Filters and the list card were checked at desktop width only; the
  small-screen layout (chips wrapping, list capped at 70vh) hasn't been
  looked at on a real phone.
- Filter state isn't in the URL, so a filtered view can't be shared.
- All ~480 markers are SVG paths, which is fine at this size and is what
  gives us keyboard/ARIA hooks; a Canvas renderer would only matter if the
  count grew a lot.

## Suggested order

Roughly quick-win-first, independent of each other unless noted.

1. Manual QA checklist ("Testing gaps") — write down what's already being
   done by hand. Small, no dependencies.
2. `MATCHERS` test ("Structure & maintainability" (c)) — small, no
   dependencies, worth doing any time.
3. `data/resorts.json` schema/validator ("Structure & maintainability" (d))
   — small, no dependencies.
4. Split `assets/app.js` into ES modules ("Structure & maintainability"
   (a)) — no dependency on anything else here; the sooner this lands, the
   cheaper every later change (including Forecast) gets to make.
5. Wire the browser checks into CI ("Structure & maintainability" (b)) —
   independent of 4, but touching the same test surface, so doing them
   close together avoids rebasing one against the other. Also closes the
   DOM-coverage half of "Testing gaps."
6. Forecast view and forecast-based Top 10 — the biggest item here; medium
   size, depends on nothing above but benefits from (4) already being done.

Let me know which of these you'd like implemented first — happy to start
with any one in isolation.
