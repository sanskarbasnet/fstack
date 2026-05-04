---
name: ideas
preamble-tier: 1
version: 1.0.0
description: |
  List, promote, snooze, or reject wishlist ideas. The "manage what /idea
  captured" command. Promote turns an idea into an intent on the current
  branch (ready to actually build). (fstack)
allowed-tools:
  - Bash
  - AskUserQuestion
triggers:
  - ideas
  - list ideas
  - show wishlist
  - what ideas do we have
  - promote an idea
  - reject an idea
---

## What this does

Manages the wishlist. Four operations:

| Verb | What |
|---|---|
| **list** | Show open ideas in current repo (default) |
| **promote** | Convert idea → intent on current branch (ready to build) |
| **reject** | Mark as rejected with optional reason |
| **snooze** | Defer (status=snoozed); doesn't show in default list |

## Subcommands (CLI)

```bash
fstack-brain wishlist list [--status open|snoozed|promoted|rejected] [--limit N]
fstack-brain wishlist promote --id <id-prefix>
fstack-brain wishlist reject  --id <id-prefix> [--reason "..."]
fstack-brain wishlist snooze  --id <id-prefix>
```

`<id-prefix>` accepts the first 8 chars of the UUID (the short-id printed
by `/idea`).

## When to invoke

- User asks "what ideas do we have" / "show wishlist"
- User wants to start work on something they previously captured ("let's
  do that thing I wrote down" → /ideas list, find it, /ideas promote)
- Cleaning up: rejecting stale ideas
- Periodic review (Friday afternoon, before /retro): scan ideas, promote
  the next, reject the dead

## Procedure

### Default — list open ideas

```bash
fstack-brain wishlist list
```

Render the output as:
```
open ideas (N):
  • <short-id> <agent_id> [tags] — <title>
      <first 200 chars of body>
```

If empty, say so and offer to capture one with `/idea`.

### Promote

```bash
fstack-brain wishlist promote --id <prefix>
```

This:
1. Creates an intent on your current branch (with body containing
   "promoted from idea <id>")
2. Marks the wishlist row status=promoted
3. Updates local intent cache

After successful promote, suggest the user start coding. Optionally
suggest `/parallel` if they want to switch to a fresh branch first.

### Reject / Snooze

For both, ask for confirmation via AskUserQuestion if the idea was
written by another agent (don't silently kill someone else's wishlist).

## What this skill must NOT do

- Must NOT auto-promote without explicit user request. Ideas ARE the
  graveyard for stuff we didn't commit to.
- Must NOT show all statuses by default. `open` is the actionable subset.
- Must NOT delete. Reject/snooze keep history. Deletion would lose the
  audit trail.

## Output

For list: the rendered digest above.
For promote/reject/snooze: one-line confirmation.
