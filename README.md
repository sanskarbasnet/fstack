# fstack

> **fstack = Foreman's hard-fork of [garrytan/gstack](https://github.com/garrytan/gstack), stripped to its production-grade machinery, plus a shared multi-agent brain for live coordination between Sanskar and Owen.**

## What fstack is

A Claude Code skill pack and CLI for an internal two-person engineering team. fstack:

- Inherits gstack's battle-tested **production skills** (`/review`, `/qa`, `/browse`, `/codex`, `/cso`, `/canary`, `/document-release`, `/benchmark`, `/careful`, `/scrape`, `/skillify`, `/health`, etc.).
- Inherits gstack's **browser stack** (headless Chromium daemon + visible fstack-browser fork with anti-bot stealth, sidebar AI, cookie keychain import).
- Replaces gstack's single-agent productivity layer with **fstack brain** — a shared Supabase-backed coordination layer that knows what every agent is doing in real time.
- Adds 10 fstack-original skills that exploit the brain: `/sync`, `/intent`, `/presence`, `/handoff`, `/resolve`, `/decide`, `/standup`, `/office-hours`, `/office-review`, `/why`.
- Drops everything that doesn't fit a near-launch MVP: greenfield planning skills, gbrain, telemetry-to-upstream, team mode auto-update.

Pinned to gstack at upstream commit `bf65487` (v1.26.0.0). See `UPSTREAM_SYNCS.md` for cherry-pick log.

## Why this exists

You and Owen both use Claude Code for ~100% of coding. Stock Claude has no shared state across sessions. Two agents stomping on the same code, silent feature regressions, no visibility into what each other is doing. fstack solves this by making intent + presence + decisions first-class data the brain stores.

The killer feature: `/resolve`. When git surfaces a merge conflict, fstack pulls **both** branches' intents from the brain and proposes a resolution that knows what each side was trying to do — not "Claude guesses two text blobs."

## The skill inventory (~27 skills)

### fstack-original (10)
`/sync`  `/intent`  `/presence`  `/handoff`  `/resolve`  `/decide`  `/standup`  `/office-hours`  `/office-review`  `/why`

### Modified gstack skills (7) — brain-aware
`/ship`  `/land-and-deploy`  `/freeze`  `/guard`  `/retro`  `/skillify`  `/landing-report` (=`/queue`)

### Untouched gstack skills (10+)
`/review`  `/investigate`  `/qa`  `/qa-only`  `/browse`  `/setup-browser-cookies`  `/connect-chrome`  `/codex`  `/cso`  `/canary`  `/document-release`  `/benchmark`  `/careful`  `/scrape`  `/health`  `/benchmark-models`

## Install

### Prerequisites
- Claude Code installed
- Bun ≥1.0
- Git
- A Supabase project (free tier is fine)

### One-time team setup

1. Create a Supabase project. Apply `brain/schema.sql` via the SQL editor.
2. Enable Realtime on the `fstack_realtime` publication (Database → Replication).
3. Note the **Session Pooler** connection string (port 6543) and **anon key**.

### Per-machine

```bash
# clone fstack
git clone git@github.com:foreman/fstack.git ~/.claude/skills/fstack
cd ~/.claude/skills/fstack

# install (handles browser daemon, brain CLI, hooks, config)
./setup
```

`./setup` will prompt for `agent_id` (sanskar or owen), the Supabase URL, and the anon key. Configuration lives at `~/.fstack/config.yaml` (mode 600).

After setup, open Claude Code in any git repo and type `/sync` — you should see the team digest.

## Architecture (one diagram)

```
   ┌─────────────────────┐               ┌─────────────────────┐
   │ Sanskar's CC agent  │               │   Owen's CC agent   │
   └──────────┬──────────┘               └──────────┬──────────┘
              │   intent / edits / presence (heartbeat)
              ▼                                     ▼
        ┌─────────────────────────────────────────────────┐
        │   Shared brain (Supabase + Realtime)            │
        │   intents, presence, edits, decisions,          │
        │   handoffs, files, features                     │
        └─────────────────────────────────────────────────┘
              ▲                                     ▲
              │   read by /sync, /resolve, /office-hours, ...
              │
   ┌──────────┴───────────────┐
   │  GitHub (source of truth │
   │  for code; brain stores  │
   │  intent + reasoning)     │
   └──────────────────────────┘
```

For schema and design rationale, see `ARCHITECTURE.md`. For the gstack heritage, see `UPSTREAM_SYNCS.md`.

## Repo layout

```
fstack/
├── brain/
│   ├── schema.sql               # Apply to Supabase once
│   ├── cli/                     # `fstack-brain` Bun binary (called by hooks)
│   └── README.md
├── hooks/
│   ├── install.ts               # Wires Claude Code hooks
│   └── README.md
├── bin/
│   ├── fstack-brain-setup       # Brain bootstrap (called by ./setup)
│   ├── fstack-config            # gstack-inherited config CLI
│   ├── fstack-session-update    # gstack-inherited update hook
│   ├── fstack-settings-hook     # gstack-inherited Claude settings editor
│   └── ...                      # other gstack-inherited helpers
├── browse/                      # gstack-inherited Chromium daemon
├── extension/                   # gstack-inherited browser extension
├── <skill>/                     # one dir per skill, each contains SKILL.md
├── setup                        # main install entry point
├── ARCHITECTURE.md              # design + schema rationale
├── UPSTREAM_SYNCS.md            # cherry-pick log from gstack
├── LICENSE                      # MIT (preserved from gstack)
└── README.md
```

## Upstream sync rhythm

Quarterly visit `garrytan/gstack`:

```bash
git fetch upstream-gstack
git log upstream-gstack/main --since="3 months ago" --oneline
```

Cherry-pick (never merge) commits worth pulling — security patches in `browse/`, performance fixes in the Chromium daemon, useful improvements to skills we kept. Log in `UPSTREAM_SYNCS.md`.

## Principles

1. **Hard fork, not vendored dep** — fstack is ours; we own every line.
2. **Cherry-pick only on upstream sync** — surgical, never bulk-merge.
3. **Two writers, one brain** — multi-agent state in shared Supabase, no per-user partitioning.
4. **No outbound data except to our brain and LLM APIs** — telemetry to third parties is dead.
5. **Auto-magic by default, manual when meaningful** — hooks do heavy lifting; explicit slash commands for things that matter.
6. **Brownfield-shaped** — every skill must work on existing code.
7. **Awareness, not prevention** — both agents work freely; brain logs intent so conflicts get smart resolution at merge time.
8. **gstack is a starting point, not a destination** — after fork-day, fstack diverges.
9. **Schema graph-shaped from day one** — junction tables for features, FKs for relationships, no flat JSON dumping.

## Attribution

fstack is a hard fork of [garrytan/gstack](https://github.com/garrytan/gstack), MIT-licensed, with substantial modifications. Original gstack copyright preserved in `LICENSE`.

## License

MIT.
