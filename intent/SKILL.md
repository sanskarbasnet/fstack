---
name: intent
preamble-tier: 1
version: 1.0.0
description: |
  Write or read the intent for the current branch. An intent is a one-paragraph
  declaration of what you're trying to do, what you promise the change will do,
  and what it will NOT touch. Drafts auto-write on first prompt; this command
  lets you confirm, refine, or replace. (fstack)
allowed-tools:
  - Bash
  - AskUserQuestion
triggers:
  - write intent
  - what am i working on
  - my intent
  - update intent
---

## What this does

Manages the **intent record** for the current git branch. Every active branch
should have exactly one active intent describing:

- **Title** — one short line (the headline)
- **Body** — the paragraph: goal, approach, constraints
- **Promises** — what the change WILL do (testable claims)
- **Not touching** — areas the change explicitly does NOT modify

These records are the data /resolve uses to do intent-aware merges, and what
the *other* agent's /sync surfaces so they don't duplicate your work.

## When to invoke

- User runs `/intent <text>` — they want to write/refine
- User asks "what am I working on" — show current
- After `/office-hours` produces a brief — codify it as an intent
- Before starting any non-trivial work — confirm the auto-inferred intent
- When you (the agent) realize the work has *drifted* from the original
  intent — re-write it to match reality

## Subcommands

```bash
fstack-brain intent get              # show current
fstack-brain intent write \
  --title "Add IP rate limit guard at loginHandler" \
  --body  "Wedge: 5 attempts in 60s, 429 response." \
  --promises "Login throttled per-IP." \
  --not-touching "Session creation, OAuth flow."
```

## How to use it well

When asked to start a new task, do this in order:
1. Run `fstack-brain intent get` — is there already an active one?
2. If yes and it matches, proceed. If yes and the user is doing something
   different, propose `intent write` to update.
3. If no active intent, draft one based on the user's prompt and propose
   it via AskUserQuestion. One Y/N keeps you honest about scope.

Do NOT ask the user to fill out every field. Draft from context, present, ask
"OK?" The point is friction-free brain-keeping, not paperwork.

## Output

Plain text on TTY, JSON on non-TTY. Show only the title to the user unless they
ask for full details.
