---
name: presence
preamble-tier: 1
version: 1.0.0
description: |
  Show what other agents are doing right now in this repo — branches they're on,
  intents they're pursuing, files they're actively editing. Pull this whenever
  you're about to do something that might collide with the other agent. (fstack)
allowed-tools:
  - Bash
triggers:
  - what is the other agent doing
  - is anyone editing X
  - presence check
  - who is working on this
---

## What this does

Runs `fstack-brain presence` and reports the live state of every *other* agent
in this repo whose heartbeat fired in the last 5 minutes.

For each:
- agent_id (sanskar / owen)
- branch
- active intent
- status (planning / coding / reviewing / shipping / browsing / idle)
- files they're actively editing
- heartbeat age

## When to invoke

You should run this *automatically* (without being asked) right before:
- Editing a file in a known shared/sensitive area (auth, billing, db migrations)
- Refactoring something with broad reach
- Starting a major feature that might overlap with what's known to be in flight

Auto-fires at SessionStart via /sync. Runs again whenever the user explicitly
asks "what's owen doing" or similar.

## How to use the result

If another agent is editing the same file you're about to touch:
1. Note the overlap to the user — short, one line.
2. Compare intents. If they look orthogonal (your guard at the top, their
   refactor in the middle) — proceed and continue your work.
3. If they look head-on (you both rewriting the same function) — surface
   that and ask the user whether to coordinate or pivot.
4. **Do not block or wait.** fstack philosophy: awareness, not prevention.
   /resolve handles the merge with intent-aware reasoning.

## Output

```bash
fstack-brain presence
```

Plain text on TTY:
```
• owen [owen/session-refactor] — "Extract session creation into auth/session.ts"
  status=coding files=[auth/login.ts]  (45s ago)
```
