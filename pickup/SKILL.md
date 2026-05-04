---
name: pickup
preamble-tier: 1
version: 1.0.0
description: |
  Claim a handoff and hydrate full context in one command. Picks the most recent
  open handoff addressed to you (or by --id), marks it picked_up, and prints
  the parent intent, recent edits on referenced files, and related decisions.
  The Owen-onboarding-day skill — type /pickup, be oriented in <5s. (fstack)
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
triggers:
  - pickup
  - claim handoff
  - take owens handoff
  - take sanskars handoff
  - continue from handoff
  - hydrate handoff context
---

## What this does

Runs `fstack-brain handoff pickup [--id <uuid>]`. Without `--id`, claims the
most recent open handoff addressed to you (or unassigned). Returns:

- The handoff itself (note, blocker, next step, branch, files)
- The parent intent (still attributed to the original author — we don't
  steal authorship, just claim the handoff)
- Recent edits (last ~20) on the files the handoff named
- Related decisions that mention any of those files

The handoff is marked `picked_up` in the brain so the original author's next
`/sync` confirms you've taken it.

## When to invoke

- User runs `/pickup` (most common — auto-picks the most recent for them)
- User runs `/pickup <uuid>` for a specific handoff
- Auto-suggest from `/sync`: when /sync surfaces a handoff for the user,
  immediately offer "Want me to /pickup it?" — one line, single Y/N

## How to use the result

Read the digest. Then:

1. **If the handoff names a different branch**, ask via AskUserQuestion
   whether to `git checkout <branch>`. Do NOT switch branches without the
   user's Y/N — they may have uncommitted work.
2. **If the parent intent is verbose**, summarize it for the user in 1-2
   sentences. Don't dump the full body unless asked.
3. **If recent edits show another agent active in the same area within the
   last hour**, surface that as a soft warning before they dive in.
4. **If the user wants to make this their own intent on a continuing branch**,
   propose `/intent write` with a draft like "continuing <author>'s work on X".

## Subcommands (from the brain CLI)

```bash
fstack-brain handoff pickup              # most recent for me
fstack-brain handoff pickup --id <uuid>  # specific handoff
```

## What this skill must NOT do

- Must not silently checkout a different branch — AskUserQuestion first.
- Must not change the parent intent's `agent_id` — attribution stays with
  the original author. The picker just claims the handoff.
- Must not auto-pick if there are multiple equally-recent handoffs — list
  them and let the user choose.

## Output

A digest, max ~12 lines visible to the user. The CLI returns more in JSON;
condense to the highlights.
