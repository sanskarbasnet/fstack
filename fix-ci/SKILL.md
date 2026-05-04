---
name: fix-ci
preamble-tier: 4
version: 1.0.0
description: |
  Auto-investigate failing GitHub Actions runs and propose patches. Reads
  the failed logs via `gh run view --log-failed`, identifies the root cause,
  proposes a focused fix, applies on user confirmation. Removes the most
  predictable launch-week interrupt: 5-15 min of log archaeology per
  broken PR. (fstack)
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Grep
  - AskUserQuestion
triggers:
  - fix ci
  - ci is broken
  - ci failed
  - investigate failed run
  - why did ci fail
---

## What this does

Pulls the failing log from GitHub Actions, identifies the root cause,
proposes a patch, applies it on user confirmation. No new CLI; pure
orchestration over `gh` + `Read` + `Edit`.

## When to invoke

- User says "ci is broken" / "fix ci" / "why did the build fail"
- After `/ship` opens a PR and CI fails
- Auto-suggest from `/sync` if the user's last shipped PR shows a failed
  CI run (one-line nudge: "your last PR's CI failed — want me to /fix-ci?")

## Procedure

### Step 1 — find the failing run

Resolve which run to investigate:

```bash
# Most recent run on the current branch
gh run list --branch "$(git branch --show-current)" --limit 5 --json databaseId,status,conclusion,workflowName,createdAt
```

Pick the most recent run with `conclusion: "failure"` (or `"cancelled"`,
`"timed_out"`). If no failed run exists, output `(no failing CI run on
this branch)` and exit.

If multiple workflows failed, ask which one via AskUserQuestion (or
default to the first listed).

### Step 2 — pull the failed logs

```bash
gh run view <run-id> --log-failed > /tmp/fstack-ci-fail.log
```

Read the file. Cap context: only ingest the first ~3000 lines plus the
last ~500 lines of the failed log file. CI logs can be massive; the
relevant signal is usually near the failure boundary.

### Step 3 — categorize the failure

Identify which class the failure falls in:

| Category | Signal in log | Common fixes |
|---|---|---|
| **lint** | "ESLint", "Prettier", "ruff", "rubocop" + line numbers | Auto-fix runs; or patch the offending lines |
| **type** | "TS2322", "TypeError:", "type error", "mypy" | Patch type signatures or add narrowing |
| **test** | "FAIL", "AssertionError", "expected ... received" | Patch the test OR the code under test |
| **build** | "Error:", "Cannot find module", "missing dep" | Update imports, add deps, fix paths |
| **install** | "npm ERR!", "yarn install failed", "package-lock" | Lockfile mismatch; regen lockfile |
| **infra** | "503", "timeout", "rate-limited", "Action error" | Flaky infra; suggest retry first |

Surface the category to the user in 1 line.

### Step 4 — propose a patch

For lint/type/test/build categories: read the relevant source files,
identify the change needed, draft a patch.

For infra: suggest `gh run rerun <run-id>` rather than a code change.

For ambiguous categories: ask via AskUserQuestion which interpretation
applies before proposing the patch.

### Step 5 — confirm via AskUserQuestion

Show the user:
- One-sentence diagnosis: "the lint run failed because `auth/login.ts:42`
  has an unused import"
- Proposed patch as a unified diff
- Three options: Apply patch / Modify and apply / Cancel

### Step 6 — apply + offer to push

If user accepts:
1. `Edit` the file(s).
2. `git add` the changed files.
3. `git commit -m "fix(ci): <one-line summary>"`.
4. Ask via AskUserQuestion: "Push now?" — if yes, `git push`.
5. After push, optionally watch the next run via `gh run watch`.

## What this skill must NOT do

- Must NOT auto-rerun infrastructure failures without user consent —
  could mask real flake patterns.
- Must NOT modify tests to make them pass when the production code is
  the bug. Diagnose which side is broken; default to fixing the code
  unless the test is clearly wrong.
- Must NOT push without confirmation. Push commits are user-authorized.
- Must NOT scrape the full log into context. Cap at first 3K + last 500
  lines.
- Must NOT investigate non-failing runs. If the latest run is green,
  there's nothing to fix.

## Subcommand reference

This skill has no fstack-brain subcommand of its own. It's pure shell
orchestration:

```bash
gh run list --branch <branch> --limit 5 --json ...
gh run view <id> --log-failed
gh run rerun <id>          # for infra flakes
gh run watch <id>          # post-push watch
```

## Output

A structured report:
```
CI Investigation — run #12345 on sanskar/rate-limit
  workflow:    test.yml
  failed at:   step "bun test"
  category:    test failure
  diagnosis:   2 tests fail in middleware/__tests__/rate-limit.test.ts
               assertion: 'expected 429 received 200'
  root cause:  the bucket cleanup logic skips the current request
  proposed:    [unified diff]
  next:        Apply patch → commit → push? (Y/n)
```

Followed by the AskUserQuestion prompt.
