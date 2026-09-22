# UX findings

The shared handoff between two roles, invoked on demand:

- **UX specialist** (`.claude/agents/ux-specialist.md`, a browser-only
  subagent — it can look and click, but has no file-write access at all)
  reviews the running app and appends findings here.
- **Developer** (whoever's driving the main session — you or me) reads
  new findings, decides what to act on, and either turns them into a sized
  entry in [PROPOSALS.md](./PROPOSALS.md) or implements them directly. Once
  something's resolved, move its entry to [CHANGELOG.md](./CHANGELOG.md)
  the same way every other "done" item in this project is tracked, and
  delete it from here.

**Triggering a review:** ask for one ("run a UX review of \<area\>"). The
orchestrating session starts a local preview, tells the `ux-specialist`
agent which URL/state to look at, and appends its raw report below under a
new dated heading. Nothing here is auto-applied — every finding is a
proposal until a human (or the developer role, on explicit instruction)
decides to act on it.

**Status:** first review run 2026-09-22 (see below), scoped as a validation
pass rather than a full audit. One implementation note from setting this
up: the `ux-specialist` subagent type isn't recognized by this session's
`Agent` tool (project-level custom agent definitions aren't picked up here)
— `.claude/agents/ux-specialist.md` is kept as the reusable review brief,
but reviews are actually run via the built-in `Explore` agent type (no
Edit/Write tool, so it mechanically can't touch files — Bash is technically
still available to it, so the "never modify anything" guarantee is
instruction-level there, not a hard wall) with that brief pasted in as the
task prompt. See `.claude/agents/ux-specialist.md`'s own header for the
exact invocation shape.

---

## 2026-09-22 — First pass (validation): default view, filters, Highest-altitude Top 10, search, mobile, keyboard

Scoped review to validate the process, not a full audit. Six areas
requested; all six completed, none skipped.

### Overall impression

The default "Typical season" view is honestly one of the better first-run
experiences for an off-season data app: the explanatory banner directly
addresses "why is everything showing snow in September" before the user has
to wonder, the legend is legible, and the map itself is inviting (color +
size encoding reads clearly at a glance). Filters and the two Top-10
rankings work correctly and even recompute sensibly when combined with
search. That said, this pass surfaced one launch-blocking mobile issue and
a few real interaction/accessibility rough edges — mostly around state
feedback (stale rank badges, an ambiguous "live" label) and keyboard focus
order on the map — that are worth fixing before calling the
filter/list/keyboard experience solid.

### [major] Keyboard Tab order across map markers doesn't follow the visual/region order
**Where:** Default view, Tab-only navigation through the map markers
**Observed:** Tabbing sequentially through the 27 map marker `<path>` elements and logging `document.activeElement`'s `aria-label` at each stop produced this order: Niseko United, Rusutsu, Furano, Kiroro, Sapporo Teine, Asahidake, Zao Onsen, Appi Kogen, Geto Kogen, Hakkoda, **Nozawa Onsen, Hakuba Happo-one, Hakuba Cortina, Shiga Kogen** (Nagano resorts, out of order), **Myoko Suginohara, Naeba, GALA Yuzawa** (Niigata), **Madarao** (Nagano again), **Tazawako** (Tohoku again), Kagura, Tsugaike Kogen, Takasu Snow Park, **Sahoro, Hoshino Resorts Nekoma Mountain, Joetsu International, Tomamu Ski Resort, Hakuba Iwatake** (Hokkaido/Tohoku/Niigata/Nagano all interleaved at the very end). This bounces between Hokkaido → Tohoku → Nagano → Niigata → Nagano → Tohoku → Niigata → Nagano → Chubu → Hokkaido → Tohoku → Niigata → Hokkaido → Nagano, with no relationship to the on-screen region grouping in the list below.
**Why it matters:** A sighted mouse user never notices this because they click by position, but a keyboard-only user has no way to predict where focus goes next — it doesn't match the visual layout, the list's region grouping, or even a stable geographic order. This violates WCAG 2.4.3 (Focus Order: navigation order should preserve meaning) and makes "tab to the resort I want" essentially a guessing game once past the first half-dozen markers. (This appears to stem from Leaflet re-adding/recreating marker DOM elements, per ARCHITECTURE.md's note that "Marker DOM elements are recreated whenever a marker is re-added to the map" — worth checking whether re-adds are reordering the SVG pane's child order.)
**Suggested direction:** Either keep marker DOM order stable and matched to a sensible sort (e.g., the same order the list uses), or give keyboard users an alternate path that doesn't depend on map tab order — e.g. making the resort list the primary keyboard entry point with a documented "press Enter on a marker to jump to its list row" relationship, since the list order is already predictable.

### [major] Stale Top-10 rank badges remain on resort rows after the ranking is cleared
**Where:** Default view → click "Highest altitude" → click "Clear filters"
**Observed:** Clicking "Highest altitude" correctly ranks and badges resorts 1–10. Clicking "Clear filters" afterward *does* correctly turn the ranking off (`aria-pressed` goes back to `false`, the status line reverts to "Showing 27 of 27 resorts · 450 live-only resorts are hidden..."), and the list reverts to normal region grouping — but several rows still carry their old rank-number badge in the plain grouped view: `get_page_text` shows "**2**Asahidake", "**4**Zao Onsen", "**8**Myoko Suginohara", "**1**Naeba", "**3**Kagura", "**1**Shiga Kogen" (a duplicate "1" left over from an earlier search-narrowed ranking test), "**9**Nozawa Onsen", "**7**Tsugaike Kogen", "**5**Hakuba Happo-one", "**10**Takasu Snow Park" — while every other resort in the same list has no badge at all.
**Why it matters:** This directly contradicts the "showing system status" heuristic — a cleared filter should mean *no* residual ranking indicator, but ten specific resorts keep looking specially numbered/ranked in an otherwise unranked list, which reads as either a data error or a still-active (but invisible) filter. It's also reproducible and easy to trigger from the normal "try a ranking, then clear it" flow this task asked me to test.
**Suggested direction:** The rank-badge element's visibility/content should be tied directly to the same "ranking active" state flag that governs the status line and list grouping, not left to whatever value it last rendered — clearing the ranking should also clear/hide every row's rank badge.

### [major] "Highest altitude" Top 10 silently excludes 450 of 477 resorts, with no explanation once active
**Where:** Default view → click "Highest altitude"
**Observed:** Before activating the ranking, the status line reads "Showing 27 of 27 resorts · **450 live-only resorts are hidden in Typical season mode; switch to Live now to see them**." Once "Highest altitude" is clicked, that explanation disappears and is replaced by just "Top 10 highest altitude of 27 resorts" — the reason it's only considering 27 (not all 477) is dropped exactly when it matters most for interpreting the ranking correctly. Per PROPOSALS.md, several taller resorts (e.g. Ontake 2240 at 2,215m) are medium-tier and excluded from this pool entirely, so "Top 10 highest altitude" is really "top 10 highest of the 27 curated major resorts," not of Japan's ski resorts.
**Why it matters:** A user comparing this list to outside knowledge ("wait, isn't there a taller resort than this?") has no in-context way to learn why — the one sentence that would explain it is exactly the one that gets removed by activating the feature. This is a trust/accuracy issue for a ranking whose entire value proposition is "the definitive top 10."
**Suggested direction:** Keep a short qualifier visible while a ranking is active, e.g. "Top 10 highest altitude, among the 27 resorts with a typical-season pattern" with the same "switch to Live now to see all 477" hint carried over.

### [minor] "LIVE DATA FETCHED" reads as if the map is showing live data
**Where:** Default (Typical season) view, first ~5 seconds
**Observed:** Directly under the page title, the most visually prominent status text is "LIVE DATA FETCHED / Sep 23, 12:45 AM GMT+2 JST / source: open-meteo.com" — this appears *above* the paragraph explaining that the map is currently showing the illustrative Typical-season snapshot, not live conditions.
**Why it matters:** "LIVE DATA FETCHED" actually refers to a background fetch used to determine off-season status/power the Live mode, not to what's plotted on the map right now. A user skimming the top of the page (which is exactly what a first-30-seconds skim does) can easily walk away thinking the 220cm markers they're looking at are today's real snow depth, which is the opposite of true in September.
**Suggested direction:** Either move this fetch-status line below the mode explanation, or rephrase it to something mode-aware, e.g. "Live weather checked · showing typical-season snapshot," so it can't be read as a claim about the currently-displayed values.

### [minor] Resort list rows read as one run-on string to assistive tech, unlike map markers
**Where:** Resort list (any state), inspected via accessible-name computation
**Observed:** Each map marker has a clean, comma-separated accessible name, e.g. `"Niseko United, Hokkaido, 220 centimeters, -12 degrees"`. The corresponding resort-list row button has no `aria-label` at all — its computed name falls back to concatenated child text with no separators: `"Niseko United220cm Feb 14220cm peak1308m · -12°C"`.
**Why it matters:** The same resort is announced clearly on the map and as an unpunctuated run-on in the list, for a screen-reader user doing the exact same "browse resorts" task either way. This is a straightforward WCAG 4.1.2 (Name, Role, Value) quality gap and an easy inconsistency to notice once you compare the two paths.
**Suggested direction:** Give list rows the same kind of formatted `aria-label` the markers already have (the pattern to copy already exists in the codebase).

### [minor] Region/size chip counts don't reflect the active search text
**Where:** Filter row, after typing into the search box
**Observed:** Typing "Naeba" correctly narrows the resort list to one row (Niigata), but the region chips above still read "Hokkaido 8 · Tohoku 6 · Kanto 0 · Niigata 5 · Nagano 7 · Chubu 1 · Western Japan 0" — identical to the unfiltered counts.
**Why it matters:** The counts look like live facets (as in most filter UIs), so seeing "Niigata 5" next to a list that's showing only 1 Niigata result reads as either the search being broken or the counts being wrong — a small but real "does this system trust its own numbers" moment (Nielsen's match-between-system-and-real-world).
**Suggested direction:** Either recompute chip counts against the current search text too, or visually de-emphasize/relabel them as "total in region" so it's clear they're independent of the search box.

### [polish] Active vs. inactive Top-10 toggle chips are hard to tell apart at a glance
**Where:** "TOP 10" row, "Highest altitude" chip
**Observed:** Comparing screenshots of the inactive vs. active state side by side, the only visual difference is a subtle lighter border ring around the pill — fill color and bold white text are essentially identical in both states. It was easy to mis-read the state from a screenshot before confirming the real state via `aria-pressed`.
**Why it matters:** If it's easy for a careful reviewer to misjudge, it's easy for a casual user to leave a ranking on without realizing it (compounding the "Clear filters" badge-residue issue above, since the toggle itself doesn't loudly announce "I am currently filtering your view").
**Suggested direction:** Give the active state a clearer fill/color change in addition to the border, consistent with how the region/size chips already look when they have a nonzero, meaningfully-different appearance.

---

<!-- New reviews get appended below this line, most recent last, each under
     its own "## YYYY-MM-DD — scope of this review" heading. -->
