---
name: standup
preamble-tier: 2
version: 1.0.0
description: |
  Generate a daily or weekly activity digest from the brain — what shipped, what's
  in flight, decisions logged, handoffs in motion. Free retro material. Use Friday
  afternoon or any time you want a project pulse. (fstack)
allowed-tools:
  - Bash
triggers:
  - standup
  - weekly digest
  - what shipped this week
  - retro material
---

## What this does

Aggregates from the brain over a window (default: last day, optional --window=week):

- Shipped intents (with PR URLs)
- In-flight intents (active + paused)
- Decisions authored
- Handoffs created

Sorts by recency. Groups per agent where useful.

## When to invoke

- User says "standup" / "weekly" / "what shipped" / "retro"
- Friday EOD — proactively suggest if you have a decent diff of activity
- Onboarding a new collaborator — `/standup --window=week` is their orientation

## Subcommands

```bash
fstack-brain standup                  # last 24h
fstack-brain standup --window day     # explicit
fstack-brain standup --window week    # last 7d
```

## How to format the result for the user

The CLI emits structured data. When relaying to the user, group by:

1. **What shipped** — list with PR URLs if available
2. **What's in flight** — by agent, with intent titles
3. **Decisions** — number + title only (don't dump bodies)
4. **Handoffs** — short, actionable

If the user explicitly asks for a "ship report for the team chat," draft a
2-3 sentence summary at the end. Otherwise just relay the structured digest.
