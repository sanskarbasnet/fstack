---
name: fstack-help
preamble-tier: 1
version: 1.0.0
description: |
  Auto-discover and explain every fstack skill, grouped by who triggers it
  (manual / semi-auto / auto). The single source of truth for "what can
  fstack do, and when do I type a slash command vs let the agent do it?"
  Reads SKILL.md files live so it never drifts from reality. (fstack)
allowed-tools:
  - Bash
  - Read
  - Glob
triggers:
  - fstack help
  - fstack guide
  - what fstack commands exist
  - cheatsheet
  - what should i type
  - what does the agent do
---

## What this does

Enumerates every fstack skill installed on this machine, parses its
frontmatter (name, description, triggers), and renders a grouped digest:

1. **Manual** — slash commands the user types deliberately
2. **Semi-auto** — agent suggests, user confirms (Y/N)
3. **Auto** — fires invisibly via hooks, user never types

Plus a final section: **Human-only setup actions** that the agent CANNOT
do — Supabase project creation, schema apply, hook install, credential
DM. Important for new-user onboarding (Owen's day one).

## Procedure

### Step 1 — find the fstack install root

The skill files live in one of:
- `~/.claude/skills/fstack/<skill>/SKILL.md` (canonical install path)
- `~/.claude/skills/<skill>/SKILL.md` (symlinks created by setup)

Use Glob to enumerate:
```bash
ls -d ~/.claude/skills/*/SKILL.md 2>/dev/null
```
Then filter to ones whose `name:` frontmatter ends with `(fstack)` in
description, OR whose path starts with `~/.claude/skills/fstack/`.

### Step 2 — parse each SKILL.md frontmatter

For each found SKILL.md, read the YAML frontmatter (between the first
two `---` lines). Extract:
- `name`
- `description` (1-2 line summary)
- `triggers` (list of trigger phrases)
- `preamble-tier` (1-4)

### Step 3 — classify into tiers

Use the manual/semi-auto/auto rubric documented in the brain (decision
0002 + the office-hours guidance):

**Auto** — never typed by user; fires via hooks:
- `/sync` (SessionStart)
- `intent infer` (UserPromptSubmit, internal — no slash equivalent)
- `log-edit` (PostToolUse, internal)
- `handoff auto` (SessionEnd, internal)
- `conflict-precheck` (PreToolUse on git push)
- `/touch` (auto-fired by agent on structural edits per multi-agent-awareness preamble)
- `/coordinate` (auto-fires via intent_infer when drafting fresh intent)

**Semi-auto** — agent suggests, user confirms:
- `/intent` (drafted on first prompt of new task)
- `/decide` (agent proposes when tradeoff detected)
- `/resolve` (auto-suggested when git push surfaces conflict)
- `/pickup` (auto-suggested when /sync surfaces an unclaimed handoff)
- `/blame` (auto-suggested when the agent is about to refactor a constrained line)

**Manual** — user explicitly types:
- `/office-hours <topic>` — brainstorm new feature
- `/office-review [area]` — audit shipped code
- `/parallel <task>` — start new branch + intent + presence
- `/handoff <note>` — rich handoff before stepping away
- `/standup [day|week]` — weekly digest
- `/why <file>` — file history
- `/queue` — local queue depth
- `/flush` — manual drain
- `/freeze`, `/guard`, `/unfreeze`, `/careful` — safety scopes
- `/fstack-help` — this skill
- `/idea`, `/ideas` (when built) — wishlist
- All inherited gstack production skills: `/review`, `/qa`, `/qa-only`, `/browse`,
  `/codex`, `/cso`, `/canary`, `/document-release`, `/benchmark`, `/scrape`,
  `/health`, `/skillify`, `/setup-browser-cookies`, `/investigate`, `/queue`
  (was `/landing-report`), `/ship`, `/land-and-deploy`, `/retro`

### Step 4 — render the digest

Output structure:

```
fstack help — every skill, grouped by who triggers it

═══ MANUAL (you type these) ═══

Brain coordination:
  /sync                — refresh team digest (also SessionStart auto)
  /intent              — write/refine intent for current branch
  /presence            — see what other agents are doing
  /handoff <note>      — rich handoff before stepping away
  /pickup [id]         — claim a handoff + hydrate context
  /parallel <task>     — branch + intent + presence in one shot
  /coordinate <topic>  — collision check before coding (also auto)
  /decide <title>      — log a non-obvious choice as ADR
  /standup [day|week]  — multi-agent activity digest
  /why <file>          — file history (decisions, edits, intents)
  /blame <file:line>   — git blame + brain context
  /office-hours        — YC-partner brainstorm on new feature
  /office-review       — YC-partner audit of shipped code
  /retro               — weekly engineering retrospective
  /fstack-help         — this skill

Code/QA/Ship:
  /review              — pre-landing PR review
  /investigate         — root-cause debugging
  /qa, /qa-only        — browser-based QA testing
  /browse              — Chromium daemon control
  /codex               — cross-model second opinion (OpenAI)
  /cso                 — OWASP+STRIDE security audit
  /canary              — post-deploy SRE monitoring
  /benchmark           — Core Web Vitals before/after
  /scrape              — structured data extraction
  /document-release    — update docs to match shipped diff
  /skillify            — codify a working pattern as a permanent skill
  /health              — code-health dashboard
  /ship                — sync, test, audit, push, PR
  /land-and-deploy     — merge → CI → deploy → verify

Safety:
  /careful, /freeze, /guard, /unfreeze — scope/destruction guardrails

Brain plumbing:
  /queue               — local write queue depth
  /flush               — manually drain queue to Supabase

═══ SEMI-AUTO (agent suggests, you confirm) ═══

  /intent (drafted)    — agent drafts on first prompt; you Y/N
  /decide (proposed)   — agent proposes when tradeoff detected
  /pickup (proposed)   — /sync surfaces an unclaimed handoff
  /resolve (proposed)  — git push surfaces a conflict
  /blame (proposed)    — agent suggests when refactoring constrained line

═══ AUTO (fires invisibly via hooks, you never type) ═══

  SessionStart       → fstack-brain sync           — team digest at boot
  UserPromptSubmit   → fstack-brain intent infer   — drafts intent + auto-coordinate
  PostToolUse        → fstack-brain log-edit       — every Edit/Write logged
  PreToolUse(push)   → fstack-brain conflict-precheck — overlap warning
  SessionEnd         → fstack-brain handoff auto   — stub handoff if unfinished

  /touch — fires reflexively before structural edits (per multi-agent
           awareness preamble)
  /coordinate — fires inside intent_infer when drafting a fresh intent

═══ HUMAN-ONLY (the agent CANNOT do these for you) ═══

  - Create a Supabase project (https://supabase.com → new project)
  - Apply brain/schema.sql in the Supabase SQL editor
  - Enable Realtime publication 'fstack_realtime' (Database → Replication)
  - Expose 'fstack' schema (Project Settings → API → Exposed schemas)
  - DM the brain_url + brain_anon_key to teammates
  - Run ./setup or ./bin/fstack-brain-setup on each new machine
  - Run `gh auth login` for cross-repo work (browser auth)
  - Push the fstack repo to GitHub (initial publish)

  See SETUP.md for the full step-by-step.
```

### Step 5 — short-form mode

If the user runs `/fstack-help <query>`, do a **focused** answer instead
of the full digest:
- Search skill descriptions + triggers for the query
- Return only matching skills with their full info
- Example: `/fstack-help conflict` → returns /resolve, /coordinate,
  /pickup with their When-to-invoke sections

## What this skill must NOT do

- Must NOT be a static cheatsheet that drifts. Always read SKILL.md files
  live. If a skill exists on disk but isn't in your output, that's a bug.
- Must NOT recommend skills the user doesn't have installed. Filter by
  what's actually on `~/.claude/skills/`.
- Must NOT duplicate the README. README is "what is fstack." This skill
  is "how do I USE fstack right now."
- Must NOT skip the human-only section — Owen joining will hit those
  steps and needs to see them prominently.

## Output

Plain text rendered cleanly. Use the `═══` and group headers shown above.
Default mode is the full digest (4 groups + human-only). Short-form mode
when an argument is passed.
