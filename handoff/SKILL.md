---
name: handoff
preamble-tier: 1
version: 1.0.0
description: |
  Write a session-handoff note to the brain — what you're doing, what's blocking
  you, what should happen next. Auto-fires (lightly) at SessionEnd if there are
  uncommitted changes. Use the rich form when stepping away mid-task. (fstack)
allowed-tools:
  - Bash
  - AskUserQuestion
triggers:
  - handoff
  - i'm stepping away
  - leave a note for owen
  - leave a note for sanskar
  - log where i left off
---

## What this does

Writes a `handoffs` row in the brain. Two flavors:

- **Auto handoff** — runs on SessionEnd hook. Fires only if there's an active
  intent and uncommitted files. Stub note: "(auto) Session ended with N
  uncommitted file(s) on '<intent>'".

- **Rich handoff** — explicit, called when you `/handoff <text>`. Captures:
  - Note (what's the state)
  - Blocker (what's stopping progress, if anything)
  - Next step (what to do when picking back up)
  - Optionally a target agent (or null = anyone)

Open handoffs surface in the next /sync run for the target agent.

## When to invoke (rich)

- User says "stepping away," "have a meeting," "EOD" — propose `/handoff`
  with a one-line blocker if appropriate
- User explicitly types `/handoff <message>`
- You hit a hard blocker (waiting on data / a decision / a teammate) and
  want the other agent to potentially help

## Subcommands

```bash
fstack-brain handoff write \
  --note      "Stuck on rate-limit window — token bucket vs sliding" \
  --blocker   "need login traffic shape from metrics" \
  --next-step "run scripts/login-traffic-7d.ts and decide" \
  --to-agent  owen        # optional; omit for 'anyone'
fstack-brain handoff list   # see open handoffs for me
fstack-brain handoff auto   # used by SessionEnd hook
```

## Drafting from context

When the user says "I'm stepping away," draft the three fields from
conversation context, present via AskUserQuestion, accept their edits, then
write. Don't make them fill out a form.
