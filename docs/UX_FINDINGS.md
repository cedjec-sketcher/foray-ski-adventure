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

Scoped review to validate the process, not a full audit — six areas
requested, all six completed. **Closed out 2026-09-22: all 7 findings
(1 blocker, 3 major, 3 minor/polish) either fixed or investigated and
resolved; see [CHANGELOG.md](./CHANGELOG.md), "UX" for what changed and
how each was verified.** Kept here only as a short summary, since the
detailed write-ups now live there.

Overall impression at the time: a genuinely strong first-run experience
(the off-season explanatory banner, the legend, the map itself) let down
by some real state-feedback and accessibility rough edges — none of which
turned out to need a large change.

---

<!-- New reviews get appended below this line, most recent last, each under
     its own "## YYYY-MM-DD — scope of this review" heading. -->
