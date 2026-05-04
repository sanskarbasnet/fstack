# fstack brain

The shared memory layer for fstack. Backed by Supabase Postgres + Realtime.

## Layout

```
brain/
├── schema.sql        # Apply once to your Supabase project
├── server/           # Bun HTTP + MCP server (runs on each agent's machine)
└── cli/              # `fstack-brain` binary, called by Claude Code hooks
```

## One-time setup (per team)

1. Create a free Supabase project at https://supabase.com.
2. From the SQL editor, paste the contents of `schema.sql` and run.
3. Database → Replication → enable Realtime on the `fstack_realtime` publication.
4. Note your project's **Session Pooler** connection string (port `6543`) and the **anon key**.
5. Drop these into each teammate's `~/.fstack/config.yaml` during `./setup`.

## Per-machine setup

Handled by `./setup` at fstack root. Writes:

```yaml
# ~/.fstack/config.yaml
agent_id: alice                # your handle
brain_url: https://xxx.supabase.co
brain_anon_key: eyJ...
machine: alice-mbp
```

## Schema overview

First-class entities:
- `agents` — one row per teammate
- `repos` — every repo we work in
- `features` — domain tags (auth, billing, matching) per repo
- `branches` — track branch state per repo
- `files` — first-class so we can attach feature tags + ownership
- `intents` — what an agent is currently doing on a branch
- `edits` — append-only change log
- `decisions` — ADRs with compiled-truth + timeline body
- `handoffs` — session-end notes
- `presence` — LIVE; one row per (agent, repo); 5-min heartbeat TTL

Junction tables (the graph edges):
- `file_features`, `decision_features`, `decision_files`,
  `intent_features`, `intent_decisions`

Views (the queries you actually run):
- `live_presence`, `active_intents`, `file_intents`, `decisions_by_feature`

## Realtime channels

`fstack_realtime` publishes inserts/updates/deletes on `presence`, `intents`,
`handoffs`. The CLI's heartbeat command writes to `presence`; other agents
subscribe and react.

## RLS

Disabled in v1 — trusted two-person team, single shared anon key. `agent_id`
is for attribution, not access control. If we grow beyond two people, swap
in proper policies keyed off `auth.uid()`.
