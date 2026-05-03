---
name: why
preamble-tier: 1
version: 1.0.0
description: |
  Quick "why is this here?" lookup for a file or symbol. Surfaces decisions that
  affect it, intents that touched it, and the recent edit history with author
  + summary. Use when a piece of code looks weird and you don't want to re-debate
  it. (fstack)
allowed-tools:
  - Bash
  - Read
  - Grep
triggers:
  - why is this
  - why does this exist
  - history of this file
  - who touched this
---

## What this does

`fstack-brain why --target <file>` returns:

- **Decisions** linked to that file (via the `decision_files` junction)
- **Recent edits** (last 20) with operation, agent, and summary, joined to
  the intent that produced each edit

Lets you reconstruct "what was this person trying to do" without `git blame`
+ PR archaeology.

## When to invoke

- A piece of code looks surprising or arbitrary
- Before refactoring something to confirm what depends on its current shape
- During /resolve to understand the recent history of a conflicting file
- During /office-review when auditing a feature's history

## How to use it

```bash
fstack-brain why --target src/auth/login.ts
```

The output is plain text on TTY. Read it, summarize the relevant findings to
the user. If decisions exist, *those are the answer* — quote the title and
ADR number. If only edits exist, surface the most recent intent.

## What it does NOT do

- It does not run `git blame` (use `git blame` for that — it's faster).
- It does not fall back to greppage if the brain has no record. If the brain
  is empty for that file, just say so: "no decisions or edits recorded for
  this file in fstack."

## Future

When the codebase index lands, `/why` should also accept symbols (e.g.
`/why createSession`). For now, file paths only.
