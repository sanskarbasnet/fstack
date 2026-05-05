---
name: decide
preamble-tier: 1
version: 1.0.0
description: |
  Log a decision (ADR) to the brain and write a markdown file in
  docs/decisions/NNNN-slug.md. Capture non-obvious calls so future-you and the
  other agent don't relitigate them. Search past decisions before recommending
  anything load-bearing.

  Most decisions auto-log via the UserPromptSubmit hook (`fstack-brain decide
  infer`) — you only need to invoke /decide manually for refining a stub or
  capturing a decision that didn't trip the regex detector. (fstack)
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

## Auto-detection (zero-friction default)

Every user prompt fires `fstack-brain decide infer` via the UserPromptSubmit
hook. The detector uses a regex pre-filter against decision-shaped patterns
("let's go with", "decided", "going with", "instead of", "we'll use",
"sticking with", "ditch", "deprecate", "no longer use", etc.) plus heuristic
guards that skip questions, hypotheticals, and very short prompts.

When the detector hits, the decision auto-logs with `source='infer'` — no
prompt to the user, no waiting on agent judgment. Review the auto-logged
batch with `fstack-brain decide search --query <topic>` (the `source` column
distinguishes manual vs inferred). Refine stub bodies via `decide write`
when needed.

**Off-switch:** `FSTACK_DECIDE_INFER_OFF=1` disables the hook detector
entirely. Keep this in your shell when working on something the brain
shouldn't be observing (security review, sensitive prompt drafting, etc.).

**Dedup:** the detector skips duplicates of the same prompt within a
5-minute cooldown, so retyping doesn't spam the brain.

## When to invoke /decide manually

The hook catches most decisions, but invoke /decide manually when:

- The decision happened across multiple turns and no single prompt captured
  it (the regex detector only sees one prompt at a time)
- You want to refine a stub the detector wrote — set a real title and body
- A non-obvious tradeoff was made by the agent (not by your prompt) — the
  hook only sees user input, not agent output
- You want to capture a deliberate "we are NOT doing X" decision

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
