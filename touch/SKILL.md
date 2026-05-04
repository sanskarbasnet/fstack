---
name: touch
preamble-tier: 1
version: 1.0.0
description: |
  Declare what files you're ABOUT to edit. Updates your presence with
  status=planning and active_files set so the other agent's /sync surfaces
  your scope BEFORE the first edit fires. Auto-fires when the agent is
  about to do a structural edit; can be invoked manually. (fstack)
allowed-tools:
  - Bash
triggers:
  - touch
  - declare scope
  - im about to edit
  - im going to refactor
  - heads up im in
---

## What this does

Calls `fstack-brain heartbeat --status planning --files "<comma-list>"` to
broadcast your declared scope to the brain BEFORE you start editing. The
other agent's `/sync` surfaces this within seconds.

Without `/touch`, presence only reflects what you've already edited (via
PostToolUse hook). Touch makes it proactive: collisions surface before code
is written, not after.

## When to invoke

**Auto** — the agent should fire `/touch` (without asking) right before any
of these:
- A multi-file refactor it's about to start
- An edit to a file in a known-shared/sensitive area (auth, billing, db
  migrations)
- A change that follows /coordinate finding active work nearby

**Manual** — `/touch <file1> <file2> ...` when the user wants to broadcast
intent to the team without yet starting edits.

To clear the declared scope back to idle:
```
/touch
```
(no args)

## How to call it

```bash
fstack-brain heartbeat --status planning --files "auth/login.ts,auth/session.ts"
fstack-brain heartbeat --status idle    # clears active_files
```

## What this skill must NOT do

- Must not be chatty. Run the heartbeat, output one line, move on.
- Must not /touch every single edit — that's PostToolUse's job. /touch is
  for STRUCTURAL declarations (planning a refactor, picking up a file).
- Must not block coding. Awareness, not prevention.

## Output

One line: "Broadcast scope: <files>" or "Scope cleared." That's it.
