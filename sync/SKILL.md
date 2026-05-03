---
name: sync
preamble-tier: 1
version: 1.0.0
description: |
  Pull the latest fstack brain digest — what other agents are doing right now,
  active intents, open handoffs addressed to you, and recent decisions. Auto-fires
  at SessionStart via hook. Use manually whenever you want a fresh snapshot.
  (fstack)
allowed-tools:
  - Bash
triggers:
  - sync brain
  - what is owen working on
  - what is sanskar working on
  - any open handoffs
  - whats happening in the repo
---

## What this does

Runs `fstack-brain sync` and shows the digest:
- Other agents currently live (heartbeat within 5 min)
- Other agents' open intents on this repo
- Handoffs addressed to you (or to anyone, unclaimed)
- The 5 most recent decisions logged in this repo

This is the cheapest possible "morning standup." It costs one DB round-trip and
gives you everything you need to not collide with the other agent.

## How to run

```bash
fstack-brain sync
```

Output is plain text in a TTY, JSON when stdout is non-TTY. Read it, summarize
to the user in your own voice. Highlight collisions: if another agent is on the
same branch or touching files you're about to edit, surface that prominently.

## Failure mode

`fstack-brain sync` is best-effort. If Supabase is unreachable, it prints a
short error and exits non-zero. Do not block the user — just say "brain
unreachable, working in offline mode" and proceed.
