# fstack — Setup Guide

Read this once. Follow top to bottom. Should take ~10 minutes.

This guide is for **someone joining a team** that already runs fstack. The team owner has already created the Supabase project, applied the schema, and pushed fstack to GitHub. You just need to get fstack running on your machine and pointed at the team's brain.

> If you're the **first person on the team** (no shared brain exists yet), read [`brain/README.md`](brain/README.md) first to set up the Supabase project, then come back here.

---

## What you need before you start

- **A working Linux/macOS shell.** WSL counts. Native Windows doesn't.
- **`git`** installed.
- **`node`** installed (only used to verify Bun didn't bring its own).
- **Claude Code** installed and working.
- **Three credentials from the team owner:**
  1. Clone URL (e.g. `git@github.com:foreman/fstack.git`)
  2. Brain URL (e.g. `https://xxxxxxxx.supabase.co`)
  3. Brain anon key (a long JWT starting with `eyJ...`)

DM the team owner for credentials 2 and 3 — these should never be shared in a group chat or doc.

---

## Step 1 — Install Bun (the runtime fstack is built on)

If `bun --version` already prints `1.x.x`, skip to Step 2. Otherwise:

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc                # or ~/.zshrc if you use zsh
bun --version                   # verify: should print 1.x.x
```

Bun installs into `~/.bun/bin/`. The installer adds it to your shell rc automatically.

**If `curl | bash` is blocked or you don't trust it:**

```bash
# Option A — install via npm (if you already have node):
npm install -g bun

# Option B — manual: download from https://github.com/oven-sh/bun/releases
# Unzip bun-linux-x64.zip into ~/.bun/bin/ and chmod +x ~/.bun/bin/bun
```

Either works. Bun is needed once — to compile the brain CLI into a self-contained binary. After that, Bun isn't on the hot path of fstack's day-to-day operation.

---

## Step 2 — Clone fstack into the canonical location

fstack lives in `~/.claude/skills/fstack/`. Don't put it elsewhere. Claude Code looks under `~/.claude/skills/` to discover commands, and `./setup` symlinks every skill out of fstack into the parent directory so they're discoverable.

```bash
git clone <CLONE_URL_FROM_TEAM_OWNER> ~/.claude/skills/fstack
cd ~/.claude/skills/fstack
```

If `~/.claude/` doesn't exist yet, that's fine — git will create it.

---

## Step 3 — Run setup

```bash
./setup
```

`./setup` will:
1. Detect your platform.
2. Build the gstack-inherited browser daemon (Chromium + Playwright). Takes ~30s.
3. Symlink every skill (`/sync`, `/intent`, `/review`, `/qa`, `/browse`, etc.) under `~/.claude/skills/`.
4. Build the brain CLI (`fstack-brain`) — Bun-compiled, ~80MB binary. Takes ~10s.
5. Symlink the brain binary to `~/.local/bin/fstack-brain`.
6. **Prompt for three values:**

```
agent_id        ← type your handle: 'owen', 'sanskar', etc.
                  Must match a row in the brain's `agents` table —
                  ask the team owner if you're unsure what it should be.
brain_url       ← paste the Supabase URL from the team owner
brain_anon_key  ← paste the long JWT from the team owner
```

7. Write `~/.fstack/config.yaml` (mode 0600, only readable by you).
8. Install Claude Code hooks into `~/.claude/settings.json`.
9. Run `fstack-brain doctor` — should print all green.

If doctor reports failures, jump to **Troubleshooting** at the bottom.

### What setup does NOT do

- Does NOT install per-project. fstack is global on your machine; works in every git repo.
- Does NOT touch your project repos.
- Does NOT enable telemetry. fstack never sends data anywhere except your team's Supabase + LLM APIs you're already paying for.
- Does NOT enable auto-update. Versions are pinned. Run `git pull` inside `~/.claude/skills/fstack` when the team agrees to upgrade.

---

## Step 4 — Verify in a real repo

```bash
cd ~/path/to/some/git/repo        # any git repo with `origin` set
fstack-brain doctor               # all green?
fstack-brain sync                 # should print a digest (probably empty if you're new)
```

Then **restart Claude Code** (close and reopen — hooks load at session start), open it in the same repo, and type:

```
/sync
```

You should see Claude run `fstack-brain sync` automatically and print the team digest. If other team members are currently working, you'll see them.

---

## Step 5 — You're done. How to actually use fstack

Read [`README.md`](README.md) for the philosophy and skill inventory.

The 6 commands you'll use most:

| Command | When |
|---|---|
| `/sync` | Auto-fires at session start. Run manually for a fresh team digest. |
| `/intent` | Refine the auto-drafted intent for your current task. |
| `/decide <topic>` | Log a non-obvious choice so the team doesn't relitigate. |
| `/handoff <note>` | Leave a richer note than the auto-handoff before stepping away. |
| `/resolve` | When `git push` shows a merge conflict — fstack uses both branches' intents to propose the merge. |
| `/office-hours <topic>` | YC-partner brainstorming with your codebase already loaded. |

The other ~20 skills (`/review`, `/qa`, `/ship`, `/codex`, `/cso`, `/freeze`, etc.) you invoke when the moment calls for them. Don't pre-memorize.

---

## Configuration files (where everything lives)

After setup, you'll have:

```
~/.bun/bin/bun                            # Bun runtime
~/.local/bin/fstack-brain                 # compiled brain CLI (symlink)
~/.fstack/config.yaml                     # your config (mode 600)
~/.claude/skills/fstack/                  # cloned fstack repo
~/.claude/skills/<skill-name>/            # symlinks from setup
~/.claude/settings.json                   # hooks + env.PATH
```

You should never need to edit `settings.json` or `config.yaml` directly. If you do, run `cd ~/.claude/skills/fstack && bun hooks/install.ts` afterwards to make sure hooks are still wired correctly.

---

## Updating fstack

When the team agrees to pull in upstream changes:

```bash
cd ~/.claude/skills/fstack
git pull
./setup           # re-runs build, refreshes symlinks, re-installs hooks
```

`./setup` is idempotent — re-running won't break anything. It'll skip existing config and only rebuild what changed.

---

## Uninstalling

```bash
cd ~/.claude/skills/fstack
bun hooks/install.ts --uninstall    # remove hooks from settings.json
rm -rf ~/.fstack ~/.local/bin/fstack-brain
rm -rf ~/.claude/skills/fstack
# also remove the symlinks setup created at ~/.claude/skills/<skill-name>/
find ~/.claude/skills -maxdepth 1 -type l -delete
```

That's it. No system files modified.

---

## Troubleshooting

### `bun: command not found` after install

Bun installed but the shell rc isn't sourced. Run:
```bash
source ~/.bashrc       # or ~/.zshrc
```
Or open a new terminal.

### `fstack-brain: command not found`

`~/.local/bin` isn't on your PATH. The installer should have added it; if not:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### `fstack-brain doctor` says "Invalid schema: fstack"

The team's Supabase project hasn't exposed the `fstack` schema. Tell the team owner: "go to Supabase → Project Settings → API → Exposed schemas, add `fstack`."

### `fstack-brain doctor` says "permission denied for schema fstack"

The schema is exposed but the anon role lacks privileges. Tell the team owner to run the GRANT block from `brain/schema.sql` (the section commented `POSTGREST GRANTS`).

### `/sync` says "Unknown command"

Skills aren't symlinked into `~/.claude/skills/`. Re-run `./setup` and **restart Claude Code**.

### Hooks fail with `fstack-brain: not found` in Claude Code chat

Hooks were installed before `~/.local/bin/fstack-brain` was created, OR your Claude Code subshell PATH doesn't include `~/.local/bin`. Re-run:
```bash
cd ~/.claude/skills/fstack
bun hooks/install.ts        # reinstalls with absolute paths
```
Then restart Claude Code.

### `fstack-brain sync` says "no git remote 'origin'" but you have remotes

You may be on an old build. fstack-brain falls back to any remote (or `local:<path>` if none). Update:
```bash
cd ~/.claude/skills/fstack
git pull
./setup
```

### Anything else

- Check the team owner is on the same fstack version: `cd ~/.claude/skills/fstack && git log --oneline | head -3`. Compare with theirs.
- Run `fstack-brain doctor` and paste the output to the team owner.
- Look at recent changes: [`UPSTREAM_SYNCS.md`](UPSTREAM_SYNCS.md) tracks what was pulled from upstream gstack and when.

---

## Hard rules — for everyone using fstack

1. **Never share the brain anon key in any group chat, doc, or commit.** It's the team's shared secret. DM only.
2. **Never edit `~/.fstack/config.yaml` to change `auto_upgrade` or `telemetry`.** They're pinned for a reason.
3. **Never `git merge upstream-gstack/main` from inside the fstack repo.** Cherry-pick only. See `UPSTREAM_SYNCS.md`.
4. **Never disable hooks individually.** If something's wrong, run `bun hooks/install.ts --uninstall`, fix it, then `bun hooks/install.ts` again. Don't hand-edit `~/.claude/settings.json`.

---

That's setup. Now go run `/sync` from inside Claude Code and start working.
