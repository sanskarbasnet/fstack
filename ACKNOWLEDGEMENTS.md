# ACKNOWLEDGEMENTS

fstack would not exist without the work it was forked from. This document credits the people, projects, and software fstack inherits from.

---

## Forked from gstack

fstack is a hard fork of **[gstack](https://github.com/garrytan/gstack)** by **Garry Tan** (President & CEO of Y Combinator), released under the MIT License.

- **Repository:** https://github.com/garrytan/gstack
- **Pinned upstream commit:** `bf65487162ce5e4330efc43632ca945b640ebc16`
- **Pinned upstream version:** `v1.26.0.0`
- **Forked:** 2026-05-04

### What we inherited from gstack (and gratefully kept)

These pieces are gstack's original work, used by fstack as-is or with light modification. We are deeply grateful for them — they represent thousands of hours of design, testing, and dogfooding by Garry and the gstack contributor community:

- **Browser stack** — the headless Chromium daemon, Playwright integration, accessibility-tree-based ref system (`@e1`, `@e2`), 6-layer prompt-injection defense, dual-listener security model, macOS Keychain cookie import. Used by `/browse`, `/qa`, `/qa-only`, `/scrape`.
- **Production-phase skills** — `/review`, `/investigate`, `/qa`, `/qa-only`, `/codex`, `/cso`, `/canary`, `/document-release`, `/benchmark`, `/careful`, `/scrape`, `/health`. Used as-is.
- **Modified-but-mostly-gstack skills** — `/ship`, `/land-and-deploy`, `/freeze`, `/guard`, `/retro`, `/skillify`, `/queue`. Brain-aware overlays added on top of gstack's original behavior.
- **Hook plumbing** — the `SessionStart` / `PostToolUse` / `UserPromptSubmit` / `PreToolUse` / `SessionEnd` hook registration system and `fstack-settings-hook` helper.
- **Multi-host config system (`hosts/`)** — declarative `HostConfig` interface that lets the same skill templates render across Claude Code and other AI coding agents.
- **Skill `.md` format** — YAML frontmatter (name, version, description, allowed-tools, triggers) + markdown instructions, auto-discoverable by Claude Code under `~/.claude/skills/`.
- **Bun-based CLI architecture** — the pattern of compiled-to-binary subcommand dispatch via Bun.
- **Model overlay system (`model-overlays/`)** — per-model behavior patches injected into every skill at runtime to normalize style across Claude/GPT/Gemini.
- **Many helper bins under `bin/`** — `fstack-config`, `fstack-settings-hook`, `fstack-paths`, `fstack-relink`, `fstack-question-log`, etc.

### "Boil the Lake" and other principles

References in fstack skill bodies to the **"Boil the Lake"** principle, **"Search Before Building"** principle, and other phrases of that style are Garry's original ideas from his "Builder Ethos" essay. They are used in fstack with attribution. Anyone interested in their original framing should consult the upstream gstack repository.

---

## What's original to fstack

fstack adds a multi-agent coordination layer not present in gstack. These pieces are original work by the fstack team:

- **Brain layer** (`brain/`) — Supabase-backed shared memory for live presence, intent, edits, decisions, handoffs across multiple agents. Graph-shaped Postgres schema with junction tables for features.
- **10 fstack-original skills** — `/sync`, `/intent`, `/presence`, `/handoff`, `/resolve`, `/decide`, `/standup`, `/office-hours`, `/office-review`, `/why`.
- **Brain-aware overlays** on 7 inherited skills (`/ship`, `/freeze`, `/guard`, `/retro`, `/land-and-deploy`, `/skillify`, `/queue`) that wire them into the brain.
- **Hook installer** (`hooks/install.ts`) that wires brain operations to Claude Code session lifecycle events.
- **`fstack-brain` CLI** (`brain/cli/`) — Bun-compiled binary handling all brain CRUD operations.
- **`fstack-brain-setup`** (`bin/fstack-brain-setup`) — brain bootstrap script.

### What we removed from gstack

For the avoidance of any confusion: fstack deliberately removed the following gstack components on fork-day, because they did not fit the multi-agent two-person internal-tool use case. These are **not** present in fstack:

- All greenfield planning skills (`/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review`, `/plan-tune`, `/autoplan`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/design-review`, `/devex-review`)
- The `/office-hours` skill in its gstack form (replaced by a codebase-aware fstack version)
- gstack's `gbrain` companion (replaced by fstack brain)
- gstack's `--team` mode auto-update plumbing
- gstack's outbound telemetry (Supabase project owned by gstack maintainers)
- gstack's Memory Sync to private git repos
- gstack's "Builder Ethos" personal manifesto
- Many gstack-specific bins (`*-brain-*`, `*-gbrain-*`, `*-telemetry-*`, `team-init`, `developer-profile`, `builder-profile`, `community-dashboard`, `model-benchmark`, `learnings-log`, `learnings-search`, `taste-update`, `update-check`, `session-update`)

For the full fork-day delete list, see [`UPSTREAM_SYNCS.md`](UPSTREAM_SYNCS.md).

---

## Other open-source software fstack depends on

| Project | Used for |
|---|---|
| [Anthropic Claude Code](https://www.anthropic.com/claude/claude-code) | The AI coding agent fstack runs inside |
| [Claude API / SDK](https://github.com/anthropics/anthropic-sdk-typescript) | LLM calls in skills |
| [Bun](https://bun.sh) | CLI runtime + bundler + compiler |
| [Supabase](https://supabase.com) | Postgres + Realtime backend for the brain |
| [supabase-js](https://github.com/supabase/supabase-js) | Brain client SDK |
| [Playwright](https://playwright.dev) | Chromium automation in `/browse` (inherited from gstack) |
| [Chromium](https://www.chromium.org) | Browser daemon (inherited from gstack) |

All used per their respective licenses.

---

## License

fstack is MIT-licensed. The original [`LICENSE`](LICENSE) file preserves both Garry Tan's copyright (gstack) and the fstack team's copyright (modifications). Both are necessary for compliance with the MIT License's attribution requirement when distributing modified versions.

If you redistribute fstack, you must preserve both copyright notices and the LICENSE file.

---

## A direct thanks

To Garry Tan and the gstack contributor community: **thank you**. Your decision to open-source a working Claude Code workflow gave us the platform fstack is built on. The hardest 80% of fstack is your work; we just added the 20% specific to two-agent coordination on top.

If you find fstack useful, please also star and consider [gstack](https://github.com/garrytan/gstack) — that's where this all started.
