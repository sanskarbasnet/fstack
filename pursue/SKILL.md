---
name: pursue
preamble-tier: 4
version: 1.0.0
description: |
  Autonomous long-horizon execution loop for the active intent + linked spec.
  Walks through the spec's test matrix, building one row at a time with
  test-first discipline. Stops when matrix is fully passing OR user pauses
  OR 200-iteration safety cap hits. Inspired by Codex's /goal command.
  Type once — agent loops until done. (fstack)
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
triggers:
  - pursue
  - run autonomously
  - keep going until done
  - autopilot this
  - autonomous build
---

## What this does

Takes the active intent (which should reference a `docs/specs/<slug>.md`
file from `/spec`) and autonomously builds it. The agent loops:

1. Read the spec's **Test matrix** — find the next row not yet passing.
2. Write a failing test for that row's scenario.
3. Run it — confirm it fails (red).
4. Write the minimum code needed to make it pass.
5. Run all tests — confirm green.
6. Mark the matrix row done in the spec (edit the spec file: prefix row
   number with ✓).
7. Append a breadcrumb to the intent body: `[pursue iteration N: row X done]`.
8. Repeat from step 1 until all rows are ✓.

When all matrix rows pass:
- Run full project test suite (`bun test` / `npm test` / project default).
- If any unrelated test fails, surface the failure — don't claim done.
- If green, refactor pass: clean up, run tests after each meaningful change.
- Mark intent shipped via `fstack-brain intent ship`.

## Hard preconditions

Before starting, verify:

1. **Active intent exists** for the current branch. Run
   `fstack-brain intent get`. If null, STOP. Tell user to run /office-hours
   then /intent then /spec first.

2. **Spec file exists.** Search the intent body for a `[spec: docs/specs/...]`
   reference. If absent, STOP. Tell user to run /spec first.

3. **Spec has a test matrix.** Read the spec file, find the `## Test matrix`
   section, parse the markdown table. If empty, STOP. Tell user to fill the
   matrix in /spec.

4. **Working tree is clean** (or close to it). Run `git status`. If there
   are uncommitted changes unrelated to the pursuit, ask via AskUserQuestion
   whether to stash, commit, or proceed anyway.

If any precondition fails, do NOT start the loop. Surface the gap and exit.

## Stop conditions

The loop stops when ANY of these is true:

| Condition | Action |
|---|---|
| All matrix rows passing AND full suite green | Mark intent shipped, exit success |
| Matrix row fails to pass after 5 inner attempts | Pause, surface the blocker, ask user |
| 200 total iterations reached | Pause, surface progress, ask user |
| User typed /pursue pause | Save state, exit cleanly |
| Spec file missing or matrix empty | Hard fail (precondition) |
| External tool (test runner, npm) crashes | Surface error, ask user |

Never silently continue past a failure. Loop terminates explicitly.

## State + resumability

Phase data is breadcrumbed into the **intent body**:

```
[pursue: iteration 7 of ~12]
[pursue: 4/6 matrix rows done]
[pursue: row 5 in progress — sliding window edge case]
```

If the session crashes mid-pursuit, a fresh session can:
1. Run `fstack-brain intent get` → see the breadcrumbs.
2. Read the spec — find which rows are ✓ and which aren't.
3. Resume from the next unticked row.

No daemon. No persistent process. The brain + spec file together ARE the
state. A clean restart is always possible.

## Safety rules

- **Never edit files outside the scope declared in spec's "Behavior" or
  "Out of scope" sections.** The spec is authoritative.
- **Never skip the test step.** If you wrote code without a failing test
  preceding it, you violated the loop. Roll back.
- **Always run the full test suite at the end.** Matrix-only passing is
  necessary but not sufficient — must not break other features.
- **Never auto-push.** /ship handles that. /pursue ends with a
  marked-shipped intent + uncommitted (or committed-but-unpushed) tree.
  User decides when to /ship.

## Heartbeat

Every 3 iterations, write a heartbeat to the brain so other agents see
progress:

```bash
fstack-brain heartbeat --status coding --files "<files-touched-this-cycle>"
```

Other agents' /sync then shows:
```
sanskar in pursuit (iteration 7/~12), 4/6 spec rows passing
```

## Pause + resume

If the user types `/pursue pause`:
- Save current state (which row you were on, what test was failing).
- Update intent body: `[pursue: PAUSED at iteration N, row X]`.
- Exit cleanly. Don't lose work.

If the user types `/pursue resume` (or just `/pursue` with a paused intent):
- Read the breadcrumbs.
- Pick up at the row indicated.
- Continue.

## What this skill must NOT do

- Must NOT start without a spec. Hard-fail and point at /spec.
- Must NOT modify the spec file (other than checking off rows). The spec
  is the contract; if it needs changes, the user goes back to /spec.
- Must NOT push, deploy, or call external services beyond running tests
  and reading docs. Output is uncommitted code + checked-off matrix.
- Must NOT silently exceed budget. At iteration 200, surface progress
  and pause.

## Output

Loop progress to stdout as iterations complete. Final output: a 5-line
summary (rows done / tests passing / files touched / blockers / next step).

## Why this exists

Without /pursue: every Claude response is a manual stop point. You build
1 feature per hour with constant supervision.

With /pursue: type /pursue, walk away, come back to a green PR. Average
shipping multiplier 5-10× depending on feature size.

Inspired by OpenAI Codex's /goal command (CLI 0.128+, April 2026) which
showed that autonomous long-horizon loops are the single biggest agent
productivity unlock since IDE integration.
