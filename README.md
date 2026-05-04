# fstack

> A Claude Code skill pack with a shared multi-agent brain, so teammates' AI sessions can coordinate in real time. Hard fork of [garrytan/gstack](https://github.com/garrytan/gstack).

## What it does

When two or more developers code with Claude Code on the same project, their agents normally have no idea what the other is doing. Stomped commits, silent regressions, duplicate work. fstack adds a shared memory layer (a Supabase brain) that every agent reads from and writes to: who's editing what, who decided what, who handed off what.

It also ships ~44 slash commands covering the daily loop: brainstorm, spec, build autonomously, review, ship, debug, audit. Most of them inherited from gstack and proven; some are fstack-original and built around the brain.

The piece that earns its keep most often: `/resolve`. When git surfaces a merge conflict, fstack pulls the **intents** both branches recorded when their authors started work, and proposes a merge that knows what each side was trying to do. That's the difference between "an AI guessed at two text blobs" and "an AI knows the contract on each side."

## Skill inventory

44 skills total. Categorized by where they came from and whether the agent fires them automatically or you type them.

### fstack-original (22)

Coordination: `/sync` `/intent` `/presence` `/handoff` `/resolve` `/decide` `/standup` `/why` `/audit-trail`
Brainstorm + build: `/office-hours` `/office-review` `/spec` `/pursue` `/blame`
Proactive: `/coordinate` `/touch` `/parallel` `/pickup`
Wishlist: `/idea` `/ideas`
Help / fix: `/fstack-help` `/fix-ci`

### Modified gstack (7)

Brain-aware overlays on top of inherited skills: `/ship` `/land-and-deploy` `/freeze` `/guard` `/retro` `/skillify` `/queue`

### Untouched gstack (15)

Production-grade as-is: `/review` `/investigate` `/qa` `/qa-only` `/browse` `/setup-browser-cookies` `/codex` `/cso` `/canary` `/document-release` `/benchmark` `/careful` `/unfreeze` `/scrape` `/health`

Type `/fstack-help` inside Claude Code for the full live list with usage notes.

## Install

### Prerequisites

- Claude Code installed
- Bun ≥1.0
- Git
- A Supabase project (free tier works)

### One-time team setup

If your team has no shared brain yet, one person does this once:

1. Create a Supabase project. Paste `brain/schema.sql` into the SQL editor and run it.
2. Apply any migrations from `brain/migrations/` in order.
3. Database → API → Exposed schemas: add `fstack`.
4. Database → Replication: enable the `fstack_realtime` publication.
5. Note the project URL and the **anon public** key.
6. DM the URL and key to teammates. Never put them in chat or commits.

### Per machine

Each teammate runs this once on their own machine:

```bash
git clone https://github.com/sanskarbasnet/fstack ~/.claude/skills/fstack
cd ~/.claude/skills/fstack
./setup
```

`./setup` builds the brain CLI binary, symlinks all skills into `~/.claude/skills/`, installs Claude Code hooks, and prompts for `agent_id` plus the brain credentials. Config lives at `~/.fstack/config.yaml` (mode 600).

### Per project

In each project repo where you want fstack to be visible to Claude Code agents:

```bash
cd ~/code/your-project
fstack-init
```

`fstack-init` is idempotent. It writes a `## fstack` section into `CLAUDE.md` with the repo's brain scope, creates `docs/decisions/` for ADR files, and prints a `git add` / `git commit` command. Commit when ready. Once committed, anyone cloning the repo afterwards gets the section for free.

After all of that, open Claude Code in any git repo and type `/sync`. The team digest auto-fires at session start, but `/sync` is a safe verify.

## Architecture

```
   ┌──────────────────┐                      ┌──────────────────┐
   │  Agent A (CC)    │                      │  Agent B (CC)    │
   └────────┬─────────┘                      └─────────┬────────┘
            │  intent / edits / presence (heartbeat)   │
            ▼                                          ▼
        ┌──────────────────────────────────────────────────┐
        │  Shared brain (Supabase + Realtime)              │
        │  intents, presence, edits, decisions,            │
        │  handoffs, files, features, wishlist             │
        └──────────────────────────────────────────────────┘
            ▲                                          ▲
            │  /sync, /resolve, /office-hours, /audit-trail
            │
   ┌────────┴──────────────────┐
   │  GitHub (source of truth  │
   │  for code; brain stores   │
   │  intent and reasoning)    │
   └───────────────────────────┘
```

For schema and design rationale, see [`ARCHITECTURE.md`](ARCHITECTURE.md). For what fstack inherited from gstack and what's original, see [`ACKNOWLEDGEMENTS.md`](ACKNOWLEDGEMENTS.md). For the cherry-pick log of upstream syncs, see [`UPSTREAM_SYNCS.md`](UPSTREAM_SYNCS.md).

## Repo layout

```
fstack/
├── brain/
│   ├── schema.sql               # Apply to Supabase once
│   ├── migrations/              # Additive migrations (apply in order)
│   ├── cli/                     # `fstack-brain` Bun binary (used by hooks)
│   └── README.md
├── hooks/
│   ├── install.ts               # Wires Claude Code hooks
│   └── README.md
├── bin/
│   ├── fstack-init              # Per-repo bootstrap (writes CLAUDE.md section)
│   ├── fstack-brain-setup       # Brain bootstrap (called by ./setup)
│   ├── fstack-config            # Inherited config CLI
│   ├── fstack-settings-hook     # Inherited Claude-settings editor
│   └── ...                      # other inherited helpers
├── browse/                      # Inherited Chromium daemon
├── extension/                   # Inherited browser extension
├── <skill>/                     # one dir per skill, each contains SKILL.md
├── setup                        # Main install entry point
├── README.md
├── SETUP.md                     # Step-by-step onboarding
├── ARCHITECTURE.md              # Design + schema rationale
├── BROWSER.md                   # Inherited browser daemon reference
├── ACKNOWLEDGEMENTS.md          # Credits + attribution
├── UPSTREAM_SYNCS.md            # Cherry-pick log from gstack
├── CLAUDE.md                    # Project instructions for Claude Code
├── LICENSE                      # MIT (preserves both copyrights)
└── VERSION
```

## Upstream sync rhythm

Visit `garrytan/gstack` quarterly or whenever a useful change is announced:

```bash
git fetch upstream-gstack
git log upstream-gstack/main --since="3 months ago" --oneline
```

Cherry-pick (never merge) commits worth pulling: security patches in `browse/`, performance fixes in the Chromium daemon, improvements to inherited skills. Log every sync in `UPSTREAM_SYNCS.md`.

## Principles

1. **Hard fork, not vendored dep.** fstack owns every line. No live-updating from upstream.
2. **Cherry-pick only.** Surgical syncs, never bulk merges.
3. **Brain is shared, scoped per-repo.** All agents read and write to the same Supabase. Each repo gets its own row in the `repos` table; intents, decisions, edits, handoffs are scoped to it.
4. **No outbound data.** Telemetry to upstream is removed. The only network calls are to your brain and to LLM APIs you already use.
5. **Auto-magic by default, explicit when meaningful.** Hooks do heavy lifting; slash commands are for moments that need user judgment.
6. **Brownfield-shaped.** Every skill must work on existing codebases, not just greenfield.
7. **Awareness, not prevention.** Agents work freely. The brain logs intent so conflicts get smart resolution at merge time.
8. **gstack is a starting point, not a destination.** Fork-day was the last time fstack and gstack agreed on a tree.
9. **Schema graph-shaped from day one.** Junction tables for features, foreign keys for relationships, no flat JSON dumping.

## Attribution

fstack is a hard fork of [garrytan/gstack](https://github.com/garrytan/gstack), MIT-licensed, with substantial modifications. The original gstack copyright is preserved in [`LICENSE`](LICENSE). The full picture of what's inherited, what's original, and what's removed lives in [`ACKNOWLEDGEMENTS.md`](ACKNOWLEDGEMENTS.md).

## License

MIT. See [`LICENSE`](LICENSE) — both the original gstack copyright and the fstack contributors' copyright are preserved.
