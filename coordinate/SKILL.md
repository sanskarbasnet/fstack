---
name: coordinate
preamble-tier: 1
version: 1.0.0
description: |
  Brain-wide collision check before any non-trivial change. Scans active intents
  from other agents + recently shipped intents + related decisions for the
  current repo, ranked by topic match. Surface BEFORE coding, not at push time.
  Auto-fires on UserPromptSubmit; can also be invoked manually. (fstack)
allowed-tools:
  - Bash
  - AskUserQuestion
triggers:
  - coordinate
  - collision check
  - is anyone working on
  - check before i start
  - any overlap on
---

## What this does

Runs `fstack-brain coordinate --topic "<text>"`. Returns:

- **Active overlaps** — other agents' active intents that match the topic keywords
- **Recently shipped** — intents shipped in the last 7d that match (so you don't redo solved work)
- **Related decisions** — past decisions that constrain how this should be done

## When to invoke

- **Auto:** Before drafting an intent for a new task on the current branch.
  The agent should run this proactively the first time a non-trivial topic
  comes up in a fresh session, BEFORE writing any code.
- **Manual:** `/coordinate <topic>` — user explicitly checks for collisions.

## How to use the result

If `has_overlap=false` and no shipped_recent / decisions: green light, proceed.

If overlaps exist:
1. STOP. Surface the overlap to the user.
2. Offer pivots:
   - **Coordinate:** ping the other agent (DM Owen / Sanskar) to decide who continues.
   - **Pivot:** propose a complementary angle (e.g., "they're doing IP-rate-limit, you do account-lockout").
   - **Skip:** abandon this task, pick another.
3. Use AskUserQuestion to capture their choice.

If shipped_recent has hits: warn that the area was just touched — read those PRs first.

If related_decisions has hits: cite them by number and summarize before coding. Don't relitigate.

## Subcommand

```bash
fstack-brain coordinate --topic "add rate limiting to login"
```

Returns plain text on TTY, JSON on non-TTY.

## What this skill must NOT do

- Must not block coding silently. If overlap exists, surface it; the user
  decides. We are awareness, not prevention.
- Must not flag every prompt — only when the topic is non-trivial. "fix typo"
  doesn't need a collision check; "add OAuth" does.
- Must not duplicate /office-hours. /coordinate is a defensive check;
  /office-hours is a brainstorm.
