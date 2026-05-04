---
name: idea
preamble-tier: 1
version: 1.0.0
description: |
  Capture a feature idea or wishlist item for later — separate from intents
  (intents = NOW on a branch; ideas = LATER, no commitment). Friction-free
  drop-in: type /idea <text> mid-coding without context-switching. Promote
  to an intent when ready via /ideas promote. (fstack)
allowed-tools:
  - Bash
triggers:
  - idea
  - capture idea
  - save this for later
  - add to wishlist
  - dont forget
---

## What this does

Calls `fstack-brain wishlist add --title "<text>" [--body "..."] [--tags a,b]`
to write an open wishlist row. Wishlist rows are SEPARATE from intents:

| | Intent | Idea |
|---|---|---|
| When | NOW | LATER |
| Branch | required | none |
| Promises | declared | none |
| Status | active/shipped/abandoned/paused | open/snoozed/promoted/rejected |
| Visibility | /sync, /presence | /ideas only |

## When to invoke

- User says "let's do X someday" / "add to backlog" / "save this idea"
- During /office-hours when a 10-star variant gets discussed but you're
  shipping the wedge — capture the 10-star as an idea
- During code review when a refactor surfaces but isn't on this branch's
  scope — capture as an idea, don't expand current intent

## Procedure

1. Parse the user's idea text into a 1-line title (max 120 chars).
2. If they gave more context, capture as body (max ~500 chars).
3. Optional: extract 1-3 tags from the text (e.g., "auth", "perf", "owen").
4. Call:
   ```bash
   fstack-brain wishlist add --title "<title>" [--body "<body>"] [--tags "<csv>"]
   ```
5. Print a one-line confirmation with the short id (`💡 idea captured: ...`).

Stay terse. The user wanted to capture and move on, not have a conversation.

## What this skill must NOT do

- Must NOT propose acting on the idea right now. That's why it's a wishlist
  — the whole point is "for later." If the user wants to act now, propose
  /parallel or /intent instead.
- Must NOT duplicate to /decide. Decisions are made calls. Ideas are
  unmade ones.
- Must NOT log every passing thought. Only when the user explicitly asks
  to save something or when /office-hours surfaces a 10-star variant
  worth keeping.

## Output

One line. Idea title + short id. That's it.
