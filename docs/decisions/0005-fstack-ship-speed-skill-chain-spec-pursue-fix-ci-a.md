# 0005 fstack ship-speed skill chain: /spec → /pursue → /fix-ci → /audit-trail

**Status:** accepted
**Authored by:** sanskar
**Date:** 2026-05-04

**Decision:** Build these four skills in this order. They compose into a single autonomous-build chain.

1. `/audit-trail` — pure brain query: feature/file lineage (intents + decisions + edits + ships). Built first because it's pure-data + makes the brain visibly compound for every other skill.
2. `/spec` — produces docs/specs/<feature>.md with goal/inputs/outputs/behavior/edge-cases/test-matrix/out-of-scope. Pure skill, no CLI. The contract /pursue will execute against.
3. `/pursue` — autonomous long-horizon loop (Codex /goal-style). Reads active intent + linked spec, iterates: pick next task → code → test → fix → repeat until spec satisfied. Pure skill v1; CLI subcommand for budget/pause-resume can come later.
4. `/fix-ci` — auto-investigate failing CI runs (gh run view --log-failed → identify cause → propose patch). Pairs with /pursue and /ship.

**Why this chain:** type /office-hours → /spec → /pursue, walk away, come back to a ready PR. /fix-ci removes the most common interrupt. /audit-trail makes the data trail visible.

**Why these 4 not 9:** other 5 ideas (/tdd, /diff-review, /deps, /diagram, /copilot) can wait for real-use signal. Building 9 at once = building blind.

**When to revisit:** after 1 week of real two-agent use. /retro will show which deferred skill (if any) would have helped. Don't pre-build.