# fstack ARCHITECTURE

> The canonical reference for how fstack is wired. Read once, refer back forever.

## Three-layer architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3 — SKILLS  (Markdown, read by Claude Code)               │
│ ───────────────────────────────────────────────────────────────  │
│ 10 fstack-original   + 7 brain-aware (modified gstack)          │
│ + 10+ untouched gstack production skills                        │
│ + browser stack (/browse, /qa, /qa-only, /scrape, …)            │
│ Skills shell out to `fstack-brain` via Bash for DB ops.         │
└─────────────────────────────────────────────────────────────────┘
                             ▲
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2 — RUNTIME  (Bun + Claude Code hooks)                    │
│ ───────────────────────────────────────────────────────────────  │
│ `fstack-brain` CLI binary  — single-shot subcommand dispatch    │
│ Claude Code hooks          — auto-fire CLI at lifecycle events  │
│ Chromium daemon (inherited from gstack/browse) — for /qa /browse│
└─────────────────────────────────────────────────────────────────┘
                             ▲
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1 — DATA  (Supabase Postgres + Realtime)                  │
│ ───────────────────────────────────────────────────────────────  │
│ Graph-shaped schema. First-class entities + junction tables.    │
│ Realtime publication on presence, intents, handoffs.            │
└─────────────────────────────────────────────────────────────────┘
```

## Layer 1 — data

### Schema philosophy

- **Graph-shaped, not flat.** First-class entities (`agents`, `repos`, `features`, `files`, `intents`, `decisions`, `branches`) connected via FKs and junction tables. No JSON-blob dumping for relationships.
- **One brain, two writers.** Every row tagged with `agent_id`. No per-user partitioning; queries filter by `agent_id` for attribution.
- **Append-only edits log.** `edits` is the single-source-of-truth for "who touched what when" — feeds `/why`, `/resolve`, conflict precheck.
- **Compiled-truth + timeline pattern (borrowed from gbrain).** `decisions.body` holds current understanding; `decisions.timeline` is an append-only JSONB array of events. Lets you see "this decision evolved over time" without losing the current state.

### First-class entities

| Table | What | Why first-class |
|---|---|---|
| `agents` | one row per teammate (e.g. `alice`, `bob`) | Attribution everywhere; permissioning hook for future |
| `repos` | One row per repo (canonical `github.com/org/name` form) | Multi-repo support from day 1 |
| `features` | Domain tags per repo (auth, billing, matching) | Cross-cutting query axis |
| `files` | Every file we've ever touched | Attach features + ownership; referenced by `edits` |
| `branches` | Branch state per repo | Foreign-key target for intents |
| `intents` | What an agent is doing on a branch | The conflict-resolution payload |
| `edits` | Append-only edit log | Powers `/why`, regression precheck |
| `decisions` | ADRs with timeline | Long-lived knowledge |
| `handoffs` | Session-end notes | Cross-session continuity |
| `presence` | LIVE state, 5-min TTL | Real-time awareness |

### Junction tables (the graph edges)

| Junction | Lets you ask |
|---|---|
| `file_features` | "all files in the auth feature" |
| `decision_features` | "all decisions affecting billing" |
| `decision_files` | "all decisions about this file" |
| `intent_features` | "active intents in the matching feature" |
| `intent_decisions` | "what past decisions inform this intent" |

### Helper functions

- `next_decision_number(repo_id)` — atomic ADR numbering per repo.
- `expire_stale_presence(threshold)` — sweep heartbeats older than N minutes.
- `upsert_file/branch/feature(...)` — get-or-create with read-after-write semantics.

### Views

- `live_presence` — presence + agent + intent + branch joined; only rows < 5min old.
- `active_intents` — non-shipped, non-abandoned intents joined to agent + branch.
- `file_intents` — distinct active intents that have edited a given file.
- `decisions_by_feature` — decisions grouped by feature, recent first.

### Realtime publication

`fstack_realtime` publishes inserts/updates/deletes on `presence`, `intents`, `handoffs`. Other agents' subscriptions get push updates within ~250ms.

### RLS

**Disabled in v1.** Trusted two-person team, single shared anon key. `agent_id` is for attribution, not access control. Replace with proper policies if scaling beyond the team.

## Layer 2 — runtime

### `fstack-brain` CLI

Single Bun binary (`bun build --compile`) compiled to `~/.local/bin/fstack-brain`. Subcommand dispatch via `process.argv`. Each subcommand:

1. Calls `buildCtx()` — loads config, connects to Supabase, resolves repo + branch.
2. Performs its DB ops via the typed helpers in `brain/cli/src/client.ts`.
3. Emits human-readable text on TTY, JSON on non-TTY (subagent consumption).

Subcommands:

| Command | Purpose | Called by |
|---|---|---|
| `doctor` | Health check (config + schema + agent registered) | User, setup |
| `sync` | Pull team digest | SessionStart hook + `/sync` skill |
| `heartbeat` | Write presence row | Background loop + `/freeze` etc. |
| `log-edit` | Append edits row + refresh heartbeat | PostToolUse Edit/Write/MultiEdit |
| `intent get/write/infer/ship` | CRUD on intents | `/intent`, UserPromptSubmit, `/ship` |
| `handoff write/auto/list` | Handoff CRUD | `/handoff`, SessionEnd |
| `conflict-precheck` | Diff vs other agents' intents | PreToolUse on `git push` |
| `presence` | List live other agents | `/presence` |
| `decide write/search` | ADR write + ILIKE search | `/decide`, `/office-hours` prefetch |
| `standup` | Activity digest | `/standup`, `/retro`, `/queue` |
| `why --target` | Look up decisions + edits for a file | `/why`, `/resolve` |

### Claude Code hooks

Wired by `hooks/install.ts` into `~/.claude/settings.json`:

| Event | Matcher | Command |
|---|---|---|
| `SessionStart` | — | `fstack-brain sync` |
| `SessionEnd` | — | `fstack-brain handoff auto` |
| `UserPromptSubmit` | — | `fstack-brain intent infer --prompt "$CLAUDE_USER_PROMPT"` |
| `PostToolUse` | `Edit` | `fstack-brain log-edit --op edit --file "$CLAUDE_TOOL_INPUT_FILE_PATH"` |
| `PostToolUse` | `Write` | `fstack-brain log-edit --op write --file "..."` |
| `PostToolUse` | `MultiEdit` | `fstack-brain log-edit --op edit --file "..."` |
| `PreToolUse` | `Bash:git push*` | `fstack-brain conflict-precheck` |

All hooks are best-effort — `fstack-brain` exits 0 on missing config / unreachable Supabase. Hooks NEVER block Claude Code's main flow.

### Browser daemon (inherited from gstack)

Untouched. Persistent headless Chromium + Playwright, ~100-200ms latency, accessibility-tree refs (`@e1`, `@e2`), 6-layer prompt-injection defense, dual-listener security model, macOS Keychain cookie import. Used by `/qa`, `/qa-only`, `/browse`, `/scrape`.

See `BROWSER.md` and `browse/` for full details.

## Layer 3 — skills

### Skill format

Same as gstack. YAML frontmatter (name, version, description, allowed-tools, triggers) + markdown instructions. Each skill is a top-level directory with `SKILL.md`. Claude Code auto-discovers them.

### Brain integration patterns

Three patterns for how skills interact with the brain:

1. **Pull on entry** — `/office-hours`, `/office-review`, `/sync` shell out to `fstack-brain sync` and `fstack-brain decide search` to load context before reasoning.
2. **Write on completion** — `/ship`, `/decide`, `/intent`, `/handoff` write rows after the user-visible action completes.
3. **Pre-check** — `/ship` runs `fstack-brain conflict-precheck` before the push to surface regression risk.

Skills NEVER directly query Supabase. They always go through `fstack-brain`. This keeps the data layer a single seam — change the schema, only the CLI changes.

### How skills find `fstack-brain`

Skills assume `fstack-brain` is on PATH. The setup script symlinks `brain/cli/dist/fstack-brain` → `~/.local/bin/fstack-brain`. If `~/.local/bin` is not on PATH, the user gets a setup-time warning.

## Configuration

### Per-machine: `~/.fstack/config.yaml`

```yaml
agent_id: alice                # your handle
brain_url: https://xxx.supabase.co
brain_anon_key: eyJ...
machine: alice-mbp
auto_upgrade: false            # hardcoded false (we manage versions)
telemetry: off                 # hardcoded off (no outbound)
```

Mode `0600`. Loaded by `brain/cli/src/config.ts`. Required fields validated on every CLI invocation.

### Repo-local: `.claude/settings.json`

Optional. If a repo wants different hook behavior (eg. disable certain hooks for a sensitive area), repo-local settings override `~/.claude/settings.json`. Generated by `hooks/install.ts`.

## State directories

```
~/.fstack/
├── config.yaml                    # per-machine config (mode 600)
├── analytics/skill-usage.jsonl    # local-only usage log (gstack-inherited)
├── projects/<repo-slug>/          # gstack-inherited project state
│   ├── retros/                    # legacy retros
│   ├── timeline.jsonl             # legacy event log
│   └── learnings.jsonl            # legacy learnings
└── (state cache files)

~/.claude/
├── skills/fstack/                 # if installed at this canonical path
└── settings.json                  # Claude Code hooks
```

The brain owns the *new* coordination state in Supabase. Inherited gstack skills (`/retro`, `/review`, etc.) still write some legacy data to `~/.fstack/projects/` (timeline.jsonl, learnings.jsonl) — harmless local-only logs. Eventually consolidate into the brain.

## Failure semantics

- **Supabase unreachable** — every CLI subcommand prints a one-line warning to stderr and exits 0. Hooks see this as success and don't block. Skills should detect missing brain data gracefully ("no brain context available, proceeding without").
- **Config missing** — `fstack-brain doctor` emits actionable error. Hooks degrade silently (the user just doesn't get auto-`/sync`).
- **Schema mismatch** — `doctor` catches it. CLI ops to missing tables return Supabase errors; surfaced via stderr.
- **Stale presence** — `expire_stale_presence` sweeps rows older than 5 minutes. Called inside `sync`. No background daemon required.

## Why we made these specific choices

### Why no MCP server

Considered: a long-running HTTP+MCP server that skills call as tools.
Rejected: adds infra (a daemon to keep alive), and skills shelling out to a CLI gives identical functionality with zero ops cost. We're two trusted users on local machines, not exposing a public API.

Reconsider if we ever expose the brain to remote agents.

### Why no embeddings / vector search

Considered: pgvector + OpenAI embeddings for hybrid search over decisions and intents.
Rejected for v1: we'll have ~50 decisions and ~50 active intents at peak. Postgres ILIKE is plenty. Adding pgvector means another extension, embedding pipeline, staleness tracking — all overhead with no measurable retrieval benefit at our scale.

Reconsider when we have 1000+ decisions or notice ILIKE missing relevant results.

### Why no per-user RLS

Considered: Supabase auth with `auth.uid()`-keyed RLS policies.
Rejected for v1: a small trusted team sharing one anon key. RLS adds operational overhead (Supabase auth users, JWT management) for zero security benefit when everyone with the key is already a trusted teammate.

Reconsider when we add a third person or take on client work.

### Why graph schema instead of flat key-value

Considered: a simple `events(agent_id, type, payload jsonb)` event log.
Rejected: the queries we actually want — "all decisions affecting auth", "intents that touched this file", "what's the other agent's current intent" — require join semantics. Flat JSON forces application-level joins in TypeScript. Junction tables make these one SQL query.

### Why hard fork instead of overlay

Considered: install gstack unchanged, build fstack as a separate skill pack alongside.
Rejected: gstack ships 13 greenfield skills we'll never use, plus team-mode auto-update we explicitly want off. Living with the noise creates cognitive friction every session. Fork once, get a clean tree, sync via cherry-pick when there's actually something worth pulling.

## Future work

- **gen-skill-docs.ts overlay support** — currently SKILL.md.tmpl regen would blow away our brain-aware overlays. Either teach the codegen about fstack overlays, or accept SKILL.md as hand-edited.
- **Codebase index for `/office-hours`** — current heuristic (ripgrep + import follow) works up to ~50K LOC. Add a vector index when we hit that.
- **Symbol-level `/why`** — currently file-only. When the codebase is too big to grep for symbols, add a tree-sitter or LSP-driven symbol graph.
- **MCP server** — if we expose the brain to remote agents (eg. cloud-based runs), wrap the CLI ops as MCP tools.
- **RLS** — when third user joins.
