/**
 * gbrain-sync preamble block.
 *
 * Emits bash that runs at every skill invocation:
 *   1. If ~/.fstack-brain-remote.txt exists AND ~/.fstack/.git is missing,
 *      surface a restore-available hint (does NOT auto-run restore).
 *   2. If sync is on, run `fstack-brain-sync --once` (drain + push).
 *   3. On first skill of the day (24h cache via .brain-last-pull):
 *      `git fetch` + ff-only merge (JSONL merge driver handles conflicts).
 *   4. Emit a `BRAIN_SYNC:` status line so every skill surfaces health.
 *
 * Also emits prose instructions for the host LLM to fire a one-time privacy
 * stop-gate via AskUserQuestion when gbrain_sync_mode is unset and gbrain
 * is available on the host.
 *
 * Block emitted across all tiers. Internal bash short-circuits when feature
 * is disabled; cost is <5ms.
 *
 * Skill-end sync is handled by the completion-status generator via a call
 * to `fstack-brain-sync --discover-new` + `--once`.
 */
import type { TemplateContext } from '../types';

export function generateBrainSyncBlock(ctx: TemplateContext): string {
  const isBrainHost = ctx.host === 'gbrain' || ctx.host === 'hermes';
  return `## GBrain Sync (skill start)

\`\`\`bash
_FSTACK_HOME="\${FSTACK_HOME:-$HOME/.fstack}"
_BRAIN_REMOTE_FILE="$HOME/.fstack-brain-remote.txt"
_BRAIN_SYNC_BIN="${ctx.paths.binDir}/fstack-brain-sync"
_BRAIN_CONFIG_BIN="${ctx.paths.binDir}/fstack-config"

_BRAIN_SYNC_MODE=$("$_BRAIN_CONFIG_BIN" get gbrain_sync_mode 2>/dev/null || echo off)

if [ -f "$_BRAIN_REMOTE_FILE" ] && [ ! -d "$_FSTACK_HOME/.git" ] && [ "$_BRAIN_SYNC_MODE" = "off" ]; then
  _BRAIN_NEW_URL=$(head -1 "$_BRAIN_REMOTE_FILE" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$_BRAIN_NEW_URL" ]; then
    echo "BRAIN_SYNC: brain repo detected: $_BRAIN_NEW_URL"
    echo "BRAIN_SYNC: run 'fstack-brain-restore' to pull your cross-machine memory (or 'fstack-config set gbrain_sync_mode off' to dismiss forever)"
  fi
fi

if [ -d "$_FSTACK_HOME/.git" ] && [ "$_BRAIN_SYNC_MODE" != "off" ]; then
  _BRAIN_LAST_PULL_FILE="$_FSTACK_HOME/.brain-last-pull"
  _BRAIN_NOW=$(date +%s)
  _BRAIN_DO_PULL=1
  if [ -f "$_BRAIN_LAST_PULL_FILE" ]; then
    _BRAIN_LAST=$(cat "$_BRAIN_LAST_PULL_FILE" 2>/dev/null || echo 0)
    _BRAIN_AGE=$(( _BRAIN_NOW - _BRAIN_LAST ))
    [ "$_BRAIN_AGE" -lt 86400 ] && _BRAIN_DO_PULL=0
  fi
  if [ "$_BRAIN_DO_PULL" = "1" ]; then
    ( cd "$_FSTACK_HOME" && git fetch origin >/dev/null 2>&1 && git merge --ff-only "origin/$(git rev-parse --abbrev-ref HEAD)" >/dev/null 2>&1 ) || true
    echo "$_BRAIN_NOW" > "$_BRAIN_LAST_PULL_FILE"
  fi
  "$_BRAIN_SYNC_BIN" --once 2>/dev/null || true
fi

if [ -d "$_FSTACK_HOME/.git" ] && [ "$_BRAIN_SYNC_MODE" != "off" ]; then
  _BRAIN_QUEUE_DEPTH=0
  [ -f "$_FSTACK_HOME/.brain-queue.jsonl" ] && _BRAIN_QUEUE_DEPTH=$(wc -l < "$_FSTACK_HOME/.brain-queue.jsonl" | tr -d ' ')
  _BRAIN_LAST_PUSH="never"
  [ -f "$_FSTACK_HOME/.brain-last-push" ] && _BRAIN_LAST_PUSH=$(cat "$_FSTACK_HOME/.brain-last-push" 2>/dev/null || echo never)
  echo "BRAIN_SYNC: mode=$_BRAIN_SYNC_MODE | last_push=$_BRAIN_LAST_PUSH | queue=$_BRAIN_QUEUE_DEPTH"
else
  echo "BRAIN_SYNC: off"
fi
\`\`\`

${isBrainHost ? `If output shows \`BRAIN_SYNC: brain repo detected\`, offer \`fstack-brain-restore\` via AskUserQuestion; otherwise continue.` : ''}

Privacy stop-gate: if output shows \`BRAIN_SYNC: off\`, \`gbrain_sync_mode_prompted\` is \`false\`, and gbrain is on PATH or \`gbrain doctor --fast --json\` works, ask once:

> fstack can publish your session memory to a private GitHub repo that GBrain indexes across machines. How much should sync?

Options:
- A) Everything allowlisted (recommended)
- B) Only artifacts
- C) Decline, keep everything local

After answer:

\`\`\`bash
# Chosen mode: full | artifacts-only | off
"$_BRAIN_CONFIG_BIN" set gbrain_sync_mode <choice>
"$_BRAIN_CONFIG_BIN" set gbrain_sync_mode_prompted true
\`\`\`

If A/B and \`~/.fstack/.git\` is missing, ask whether to run \`fstack-brain-init\`. Do not block the skill.

At skill END before telemetry:

\`\`\`bash
"${ctx.paths.binDir}/fstack-brain-sync" --discover-new 2>/dev/null || true
"${ctx.paths.binDir}/fstack-brain-sync" --once 2>/dev/null || true
\`\`\`
`;
}
