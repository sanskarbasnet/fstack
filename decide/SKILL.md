---
name: decide
preamble-tier: 1
version: 1.0.0
description: |
  Log a decision (ADR) to the brain and write a markdown file in
  docs/decisions/NNNN-slug.md. Capture non-obvious calls so future-you and the
  other agent don't relitigate them. Search past decisions before recommending
  anything load-bearing. (fstack)
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
triggers:
  - decide
  - log this decision
  - record this choice
  - why did we
  - search decisions
---

## What this does

Two things:

1. **Write** — `fstack-brain decide write --title T --body B`
   Inserts a `decisions` row with auto-incremented number per repo, and writes
   the corresponding ADR file at `docs/decisions/NNNN-slug.md`.

2. **Search** — `fstack-brain decide search --query Q`
   Keyword (ILIKE) search across decision title + body. Use this BEFORE
   recommending anything load-bearing — chances are it was decided before.

## When to invoke (write)

- User says "let's commit to X" / "we're going with X for now" / "decided"
- A non-obvious tradeoff was just made in conversation (architecture choice,
  vendor switch, scope cut, deferred feature)
- After resolving a long debate — write down the chosen path and the reason

You should *propose* `/decide` proactively when you detect those patterns,
via a one-line ask: "want me to /decide this?"

## When to invoke (search)

- Always at the start of `/office-hours <topic>` — what past decisions touch
  the area?
- Before answering "should we do X?" — has X already been considered?
- During `/resolve` — were either of the conflicting changes pre-decided?

## Body format

ADR bodies are markdown. Recommended structure (not enforced):

```
**Decision:** what we're doing
**Why:** the motivation
**Trade-off:** what we're giving up
**When to revisit:** specific trigger to reopen this
```

Keep it short. 100-300 words is plenty.

## Subcommands

```bash
fstack-brain decide write \
  --title "Use polling, not SSE, for job status updates (v1)" \
  --body  "**Decision:** poll every 5s.
**Why:** simpler infra, no realtime decision yet (decision 0011), 5s
acceptable for our UX (job state changes rarely).
**Trade-off:** more server load at scale.
**When to revisit:** >500 concurrent active jobs."

fstack-brain decide search --query "session"
fstack-brain decide search --query "auth" --limit 20
```

The CLI handles ADR file numbering and slug generation. You don't have to.
