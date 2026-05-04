# 0001 Brain segmentation is per-repo via canonical URL — cross-repo project grouping deferred

**Status:** accepted
**Authored by:** sanskar
**Date:** 2026-05-04

**Decision:** Each git repo is its own brain compartment. The `repos` table keys on `canonical` (e.g. `github.com/sanskarbasnet/fstack`), and every brain operation (sync, presence, intents, edits, decisions, handoffs, standup) filters by `repo_id`. There is intentionally NO higher-level `projects` table grouping multiple repos.

**Why:** You and Owen work on one repo per logical product today. Foreman is a single repo. fstack is a single repo. The per-repo scope already prevents cross-context collisions — `cd` into a different repo and `/sync` shows only that repo's activity. A `projects` table would solve a problem we don't have.

**Trade-off:** When Foreman eventually splits into multiple repos (`foreman/api`, `foreman/admin`, etc.), each repo's brain context will be isolated. `/sync` will only see the current repo. To see cross-repo activity, you'd need to manually run `/sync` from each. Acceptable until the team grows OR the codebase splits.

**When to revisit:** Either of these:
1. Foreman (or any product) splits into ≥2 repos that need to be reasoned about as one project
2. The team grows past 2-3 people and cross-repo standups become necessary
3. We add a third major repo and find ourselves wishing for a cross-repo digest

**Implementation when revisited:** Add `projects(id, name)` table + `repos.project_id` FK + optional `--project <name>` flag on `fstack-brain sync` / `standup` to aggregate across all repos in that project. Estimated: half a day, schema migration plus 2-3 query changes.