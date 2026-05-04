---
name: audit-trail
preamble-tier: 1
version: 1.0.0
description: |
  Full chronological lineage for a file or feature — every decision, intent
  start, edit, ship, handoff in time order. Different from /why (file-level
  decisions+edits) — this is the complete story including PR URLs and
  cross-event ordering. The brain's "show me everything that happened with
  X". (fstack)
allowed-tools:
  - Bash
triggers:
  - audit trail
  - history of
  - lineage of
  - everything that happened with
  - timeline for
---

## What this does

Calls `fstack-brain audit-trail --target "<file-or-feature>"` and renders the
returned event stream chronologically.

Two resolution modes:

- **File** — if target looks like a path (contains `/`, `.`, or matches a
  tracked file), returns: edits on that file, intents that produced those
  edits (with start + ship timestamps), decisions ILIKE-referencing the file.
- **Feature** — otherwise, ILIKE search across intent titles+bodies, decision
  titles+bodies, and handoff notes. Returns the union.

Events are merged and sorted chronologically with date headers.

## When to invoke

- User asks "what's the history of <file>" or "why does X exist"
- During /office-review when auditing a feature's evolution
- Before a refactor — see what's already been touched and decided
- During /resolve when both branches need history context
- New teammate (Owen day one) asking "what happened with auth"

## Output shape

```
audit-trail: auth/login.ts (8 events)

── 2026-04-15
  09:22  ▶ sanskar  intent: "Add live job status panel"
  09:45    sanskar  edit auth/login.ts
  09:46    sanskar  edit auth/login.ts
  10:01  ✓ sanskar  shipped: "Add live job status panel"
                    https://github.com/.../pull/147

── 2026-04-22
  14:30  ◆ sanskar  decision 0011: No realtime / SSE for v1
  15:10  ◆ sanskar  decision 0017: Use polling not SSE for job status

── 2026-04-29
  11:05  ▶ owen     intent: "Switch session cookie from signed to encrypted"
  11:32    owen     edit auth/login.ts
  16:18  ↪ owen     handoff → sanskar: stuck on session cookie expiry
```

Symbols:
- ▶ intent started
- ✓ intent shipped (PR URL beneath)
- ◆ decision logged
- ↪ handoff written
- (blank) edit row

## What this skill must NOT do

- Must NOT duplicate /why. /why is "file-level decisions and edits, snapshot."
  /audit-trail is "full timeline including ships and handoffs."
- Must NOT fabricate events. Empty arrays are valid output. Print "(no
  events recorded for this target)" rather than guessing.
- Must NOT chase external systems (GitHub commits, Sentry, etc.). Only the
  brain. Other skills handle other systems.

## Subcommand

```bash
fstack-brain audit-trail --target "auth/login.ts"      # file mode
fstack-brain audit-trail --target "rate limit"         # feature mode
```

## Output policy

If <30 events, print all. If 30-100, print all but warn about size. If >100,
print first 50 + last 20 + a "... <middle> events omitted" line. Never
truncate silently.
