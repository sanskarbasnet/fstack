# 0002 fstack new-skill priority order: /pickup → /coordinate → /touch → /parallel → /blame

**Status:** accepted
**Authored by:** sanskar
**Date:** 2026-05-04

**Decision:** Build the next 5 fstack skills in this order:

1. `/pickup`     — claim a handoff + hydrate context. **Manual + semi-auto suggest.** Owen-onboarding-blocker.
2. `/coordinate` — proactive collision check before any non-trivial change. **Auto on UserPromptSubmit.** Wasted-work prevention.
3. `/touch`      — declare scope before edits. **Auto** — agent fires it before a structural edit.
4. `/parallel`   — branch + intent + presence in one shot. **Manual** — user-owned context switch.
5. `/blame`      — brain-aware blame on a file:line or symbol. **Manual + semi-auto suggest.**

**Why this order:**
- /pickup is a hard gate for Owen joining well. Without it his first handoff feels clunky.
- /coordinate prevents the worst single failure mode (30+ min of duplicate work).
- /touch is cheap (already a heartbeat call) and makes presence proactive instead of reactive.
- /parallel is UX sugar — useful but not gap-closing.
- /blame is partially redundant with /why; build last.

**Trade-off:** Doing /pickup before Owen joins means it'll go un-dogfooded for a week. Acceptable — the second-day-of-Owen experience matters more than the first solo polish.

**When to revisit:** After Owen has used fstack for 2 weeks, run /retro and see which gap surfaced most. If a different ordering would help, reorder. Don't pre-optimize.