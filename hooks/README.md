# fstack hooks

Wires `fstack-brain` subcommands into Claude Code's settings.json so the brain
auto-fires at the right moments without you typing anything.

## What gets installed

| Hook event | Matcher | Command | Why |
|---|---|---|---|
| `SessionStart` | — | `fstack-brain sync` | Fresh digest at the start of every session |
| `SessionEnd` | — | `fstack-brain handoff auto` | Stub handoff if uncommitted work + active intent |
| `UserPromptSubmit` | — | `fstack-brain intent infer --prompt "..."` | Draft intent on first substantive prompt |
| `PostToolUse` | `Edit` | `fstack-brain log-edit --op edit ...` | Append to edits log + refresh heartbeat |
| `PostToolUse` | `Write` | `fstack-brain log-edit --op write ...` | Same |
| `PostToolUse` | `MultiEdit` | `fstack-brain log-edit --op edit ...` | Same |
| `PreToolUse` | `Bash:git push*` | `fstack-brain conflict-precheck` | Surface regression risk before push |

## Install

```bash
bun hooks/install.ts
```

This is run automatically by `./setup` from the fstack install root. It writes
to `$FSTACK_SETTINGS_FILE` if set, else `~/.claude/settings.json`. Atomic, idempotent.

## Uninstall

```bash
bun hooks/install.ts --uninstall
```

Removes every hook entry whose command contains `fstack-brain`.

## Failure semantics

Every hook command is best-effort:
- `fstack-brain` exits 0 even on missing config / unreachable Supabase. It just
  emits a one-line note to stderr.
- Hooks never block Claude Code from doing its job. The brain is supplementary,
  not gating.

## How to customize

Edit `HOOKS` array at the top of `hooks/install.ts`, then re-run install. The
deduper compares by command-substring, so existing entries get replaced cleanly.
