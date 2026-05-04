# UPSTREAM_SYNCS.md

Log of cherry-picks from `garrytan/gstack`. **Never merge upstream/main**, only cherry-pick.

## Fork point

- **Date:** 2026-05-04
- **Upstream commit:** `bf65487162ce5e4330efc43632ca945b640ebc16`
- **Upstream version:** `v1.26.0.0`
- **Upstream remote:** `upstream-gstack` → `https://github.com/garrytan/gstack.git`

## Sync workflow

```bash
git fetch upstream-gstack
git log upstream-gstack/main --since="3 months ago" --oneline
# pick interesting commits (security, browser daemon, skill bugs)
git cherry-pick <hash>
# resolve any conflicts (usually rename collisions: gstack→fstack)
# add an entry below
```

**Hard rules:**
- Never `git merge upstream-gstack/main` — would re-introduce all deleted skills.
- Skip anything in deleted areas: gbrain, telemetry, team mode, greenfield skills.
- Focus on: `browse/` (Chromium daemon), security patches, kept-skill bug fixes.

## Sync history

### 2026-05-04 — Second cleanup pass

- Dropped 3 skills that were on the agreed "drop" list but slipped through fork-day:
  `/benchmark-models`, `/open-fstack-browser`, `/setup-deploy`.
- Removed broken symlink `connect-chrome → open-fstack-browser`.
- Renamed `/landing-report` → `/queue` (agreed in final plan, finally executed).
- Removed orphan bins: `fstack-learnings-log`, `fstack-learnings-search`
  (powered deleted `/learn`), `fstack-model-benchmark` (powered deleted
  `/benchmark-models`), `fstack-session-update` (auto-update; we hardcoded off).
- Refreshed `~/.claude/skills/` symlinks to drop dead and pick up `/queue`.
- Updated README, ARCHITECTURE, UPSTREAM_SYNCS to reflect cleaned inventory.

Final skill count: 32 (10 fstack-original + 7 modified gstack + 15 untouched gstack).

### 2026-05-04 — Fork day

- Cleaned ~30% of upstream tree.
- Deleted skills: greenfield (`office-hours`, `plan-*`, `design-*`, `autoplan`, `plan-tune`, `devex-review`), replaced (`learn`, `context-save`, `context-restore`, `setup-gbrain`, `pair-agent`), and irrelevant (`gstack-upgrade`, `make-pdf`).
- Deleted bins: `*-brain-*`, `*-gbrain-*`, `*-telemetry-*`, `*-team-init`, `builder-profile`, `developer-profile`, `community-dashboard`, `memory-ingest`, `taste-update`, `update-check`.
- Deleted hosts: `gbrain`, `openclaw`, `hermes`, `kiro`, `factory`, `slate`, `opencode`, `cursor` (kept `claude`, `codex`).
- Deleted: `USING_GBRAIN_WITH_GSTACK.md`, `TODOS.md`, `CHANGELOG.md`, `conductor.json`, `.gitlab-ci.yml`, `openclaw/`, `browser-skills/`, `contrib/`, `agents/`, `supabase/`.
- Renamed `gstack` → `fstack` everywhere except `garrytan/gstack` upstream URLs.
- Added `brain/` (schema, CLI, server) and `hooks/` (Claude Code hook installer).
- Added 10 fstack-original skills.
- Brain-aware overlays added to: `/ship`, `/freeze`, `/guard`, `/retro`, `/land-and-deploy`, `/skillify`, `/landing-report` (renamed to `/queue` in second cleanup pass).
- Renamed `scripts/app/gstack-browser` → `fstack-browser`.

## Known follow-ups

- [ ] **gen-skill-docs.ts pipeline** — gstack uses `SKILL.md.tmpl` → `SKILL.md` codegen with `{{PREAMBLE}}`, `{{GBRAIN_CONTEXT_LOAD}}` placeholders. We bypassed it for fork-day SKILL.md edits (added fstack-brain integration sections directly). Future: either teach gen-skill-docs about fstack overlays, or accept that SKILL.md is now hand-edited and remove the auto-generated header.
- [ ] **Stale references to deleted bins** — some kept skills may still call `fstack-update-check`, `fstack-taste-update`, etc. They're safely no-op'd by `|| true` in shell preambles, but worth grepping when you see weird stderr.
- [ ] **MCP server** — deferred for v1. Skills shell out to `fstack-brain` via Bash. Reconsider if we expose the brain to remote agents.

## Cherry-picks

(none yet — first sync planned for ~2026-08)
