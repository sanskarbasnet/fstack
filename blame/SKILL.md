---
name: blame
preamble-tier: 1
version: 1.0.0
description: |
  Brain-aware blame on a file or file:line. Combines git blame (who/when/commit)
  with the brain (which intent introduced this work, decisions affecting the
  file, recent edits log). Answers "why is this here?" in one shot. (fstack)
allowed-tools:
  - Bash
  - Read
triggers:
  - blame
  - why is this line here
  - whose code is this
  - what intent introduced
---

## What this does

Runs `fstack-brain blame --file <path> [--line <n>]`:

1. `git blame` to find the commit, author, date for the line
2. Looks up the brain's `edits` log for that file
3. Joins to intents that touched it
4. Finds decisions referencing the file
5. Returns the consolidated picture

Better than plain `git blame` because it surfaces *why* (intent + decisions),
not just *who*.

## When to invoke

- **Manual** — user types `/blame path/to/file.ts:42` or `/blame path/to/file.ts`
- **Auto-suggest** — when the agent is about to refactor a line/file and
  there might be a decision constraining it, proactively suggest
  "want me to /blame this first?"

## How to use the result

The CLI returns:
- `commit` — short hash + author + date
- `line_content` — the actual line (when --line given)
- `related_intents` — intents that touched this file (with status)
- `decisions` — past decisions affecting this file
- `edits` — last 10 edits from the brain

Read the JSON / text and present the most relevant signal:
- **If decisions exist** → quote them by number. They're the *answer* to "why is this here." Don't relitigate; cite.
- **If only edits exist** → surface the most recent intent's title.
- **If nothing in the brain** → fall back to git blame info only, note "no brain context yet."

## Subcommand

```bash
fstack-brain blame --file src/auth/login.ts          # file-level
fstack-brain blame --file src/auth/login.ts --line 42  # specific line
```

## What this skill must NOT do

- Must not fabricate decisions or intents that don't exist. If brain returns
  empty arrays, say so.
- Must not duplicate /why — /why is file-level history; /blame is line-precise
  + git blame integration. Use /why when you don't have a specific line.

## Output

Conversational. Lead with the *answer* (was there a decision?), back up with
the data. Max ~10 lines.
