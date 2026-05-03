#!/usr/bin/env bun
/**
 * fstack hooks installer.
 *
 * Writes/updates ~/.claude/settings.json (or $FSTACK_SETTINGS_FILE) to register
 * the fstack hook surface:
 *
 *   SessionStart       → fstack-brain sync
 *   SessionEnd         → fstack-brain handoff auto
 *   UserPromptSubmit   → fstack-brain intent infer --prompt "$CLAUDE_USER_PROMPT"
 *   PostToolUse        → fstack-brain log-edit --file "$CLAUDE_TOOL_INPUT_FILE_PATH"
 *                          (matchers: Edit, Write, MultiEdit)
 *   PreToolUse         → fstack-brain conflict-precheck
 *                          (matcher: Bash with command containing 'git push')
 *
 * Atomic write: temp file + rename. Idempotent: dedups by command-substring match.
 *
 * Usage:
 *   bun hooks/install.ts            # install all
 *   bun hooks/install.ts --uninstall # remove all
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

type HookEntry = {
  matcher?: string;
  hooks: Array<{ type: "command"; command: string }>;
};
type Settings = {
  hooks?: Record<string, HookEntry[]>;
  [k: string]: unknown;
};

const FILE = process.env.FSTACK_SETTINGS_FILE ?? `${homedir()}/.claude/settings.json`;

// The exact commands we install.
// IMPORTANT: keep "fstack-brain" in each so dedup substring-match works.
const HOOKS: Array<{
  event: string;
  matcher?: string;
  command: string;
  /** Used for dedup: any existing hook whose command contains this string is treated as us. */
  signature: string;
}> = [
  {
    event: "SessionStart",
    command: "fstack-brain sync",
    signature: "fstack-brain sync",
  },
  {
    event: "SessionEnd",
    command: "fstack-brain handoff auto",
    signature: "fstack-brain handoff auto",
  },
  {
    event: "UserPromptSubmit",
    command: 'fstack-brain intent infer --prompt "${CLAUDE_USER_PROMPT:-}"',
    signature: "fstack-brain intent infer",
  },
  {
    event: "PostToolUse",
    matcher: "Edit",
    command: 'fstack-brain log-edit --op edit --file "${CLAUDE_TOOL_INPUT_FILE_PATH:-}"',
    signature: "fstack-brain log-edit",
  },
  {
    event: "PostToolUse",
    matcher: "Write",
    command: 'fstack-brain log-edit --op write --file "${CLAUDE_TOOL_INPUT_FILE_PATH:-}"',
    signature: "fstack-brain log-edit",
  },
  {
    event: "PostToolUse",
    matcher: "MultiEdit",
    command: 'fstack-brain log-edit --op edit --file "${CLAUDE_TOOL_INPUT_FILE_PATH:-}"',
    signature: "fstack-brain log-edit",
  },
  {
    event: "PreToolUse",
    matcher: "Bash:git push*",
    command: "fstack-brain conflict-precheck",
    signature: "fstack-brain conflict-precheck",
  },
];

function loadSettings(): Settings {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: Settings): void {
  const dir = dirname(FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${FILE}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf8");
  renameSync(tmp, FILE);
}

function ensureEvent(settings: Settings, event: string): HookEntry[] {
  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks[event]) settings.hooks[event] = [];
  return settings.hooks[event]!;
}

function dedup(entries: HookEntry[], signature: string, matcher?: string): boolean {
  // returns true if an entry with this signature+matcher already exists
  for (const entry of entries) {
    if ((entry.matcher ?? "") !== (matcher ?? "")) continue;
    for (const h of entry.hooks ?? []) {
      if (h.command && h.command.includes(signature)) return true;
    }
  }
  return false;
}

function install(): number {
  const settings = loadSettings();
  let added = 0;
  for (const h of HOOKS) {
    const entries = ensureEvent(settings, h.event);
    if (dedup(entries, h.signature, h.matcher)) continue;
    const entry: HookEntry = {
      hooks: [{ type: "command", command: h.command }],
    };
    if (h.matcher) entry.matcher = h.matcher;
    entries.push(entry);
    added++;
  }
  saveSettings(settings);
  return added;
}

function uninstall(): number {
  const settings = loadSettings();
  if (!settings.hooks) return 0;
  let removed = 0;
  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event] ?? [];
    const filtered: HookEntry[] = [];
    for (const entry of entries) {
      const filteredHooks = (entry.hooks ?? []).filter(
        (h) => !h.command?.includes("fstack-brain")
      );
      if (filteredHooks.length === 0) {
        removed++;
      } else if (filteredHooks.length !== (entry.hooks ?? []).length) {
        removed++;
        filtered.push({ ...entry, hooks: filteredHooks });
      } else {
        filtered.push(entry);
      }
    }
    if (filtered.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = filtered;
  }
  saveSettings(settings);
  return removed;
}

const args = process.argv.slice(2);
if (args.includes("--uninstall")) {
  const n = uninstall();
  console.log(`fstack hooks: removed ${n} entries from ${FILE}`);
} else {
  const n = install();
  console.log(`fstack hooks: installed ${n} new entries in ${FILE}`);
}
