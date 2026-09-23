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
