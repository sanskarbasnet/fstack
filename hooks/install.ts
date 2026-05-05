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
 *                          + fstack-brain decide infer --prompt "$CLAUDE_USER_PROMPT"
 *   PostToolUse        → fstack-brain log-edit --file "$CLAUDE_TOOL_INPUT_FILE_PATH"
 *                          (matchers: Edit, Write, MultiEdit)
 *   PreToolUse         → fstack-brain conflict-precheck
 *                          (matcher: Bash with command containing 'git push')
 *
 * Hooks run in non-interactive shells that don't load ~/.bashrc, so we cannot
 * rely on PATH lookup. Resolve the binary path once at install time and embed
 * the absolute path into every hook command.
 *
 * Atomic write: temp file + rename. Idempotent: dedups by command-substring match.
 *
 * Usage:
 *   bun hooks/install.ts                          # install all
 *   bun hooks/install.ts --uninstall              # remove all
 *   FSTACK_BRAIN_BIN=/path/to/bin bun hooks/install.ts   # override binary path
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
  env?: Record<string, string>;
  [k: string]: unknown;
};

const FILE = process.env.FSTACK_SETTINGS_FILE ?? `${homedir()}/.claude/settings.json`;

// Absolute path to fstack-brain. Hooks/agents run in non-interactive shells that
// don't load ~/.bashrc, so we cannot rely on PATH lookup. Resolve once at
// install time and embed the absolute path into every hook command.
const BRAIN = process.env.FSTACK_BRAIN_BIN ?? `${homedir()}/.local/bin/fstack-brain`;

// The exact commands we install. Signature substrings are reused for dedup
// and uninstall — keep them stable.
const HOOKS: Array<{
  event: string;
  matcher?: string;
  command: string;
  signature: string;
}> = [
  {
    event: "SessionStart",
    command: `${BRAIN} sync`,
    signature: "fstack-brain sync",
  },
  {
    event: "SessionEnd",
    command: `${BRAIN} handoff auto`,
    signature: "fstack-brain handoff auto",
  },
  {
    event: "UserPromptSubmit",
    command: `${BRAIN} intent infer --prompt "\${CLAUDE_USER_PROMPT:-}"`,
    signature: "fstack-brain intent infer",
  },
  {
    event: "UserPromptSubmit",
    command: `${BRAIN} decide infer --prompt "\${CLAUDE_USER_PROMPT:-}"`,
    signature: "fstack-brain decide infer",
  },
  {
    event: "PostToolUse",
    matcher: "Edit",
    command: `${BRAIN} log-edit --op edit --file "\${CLAUDE_TOOL_INPUT_FILE_PATH:-}"`,
    signature: "fstack-brain log-edit",
  },
  {
    event: "PostToolUse",
    matcher: "Write",
    command: `${BRAIN} log-edit --op write --file "\${CLAUDE_TOOL_INPUT_FILE_PATH:-}"`,
    signature: "fstack-brain log-edit",
  },
  {
    event: "PostToolUse",
    matcher: "MultiEdit",
    command: `${BRAIN} log-edit --op edit --file "\${CLAUDE_TOOL_INPUT_FILE_PATH:-}"`,
    signature: "fstack-brain log-edit",
  },
  {
    event: "PreToolUse",
    matcher: "Bash:git push*",
    command: `${BRAIN} conflict-precheck`,
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

/** True if any existing entry matches our signature for this event+matcher. */
function existsWithSignature(
  entries: HookEntry[],
  signature: string,
  matcher?: string
): boolean {
  for (const entry of entries) {
    if ((entry.matcher ?? "") !== (matcher ?? "")) continue;
    for (const h of entry.hooks ?? []) {
      if (h.command && h.command.includes(signature)) return true;
    }
  }
  return false;
}

/** Replace any existing entry whose command matches signature with our new command. */
function upsertEntry(
  entries: HookEntry[],
  signature: string,
  matcher: string | undefined,
  newCommand: string
): "added" | "replaced" | "unchanged" {
  for (const entry of entries) {
    if ((entry.matcher ?? "") !== (matcher ?? "")) continue;
    for (const h of entry.hooks ?? []) {
      if (h.command && h.command.includes(signature)) {
        if (h.command === newCommand) return "unchanged";
        h.command = newCommand;
        return "replaced";
      }
    }
  }
  const newEntry: HookEntry = {
    hooks: [{ type: "command", command: newCommand }],
  };
  if (matcher) newEntry.matcher = matcher;
  entries.push(newEntry);
  return "added";
}

function ensureEnv(settings: Settings): void {
  // Add ~/.local/bin and ~/.bun/bin to PATH for the Bash tool's subshell
  // (skills shell out to fstack-brain too). settings.env values are NOT
  // shell-expanded by Claude Code — they're treated as literal strings — so
  // we have to embed the standard system PATH explicitly here, not ${PATH}.
  const localBin = `${homedir()}/.local/bin`;
  const bunBin = `${homedir()}/.bun/bin`;
  const systemPath =
    "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
  const newPath = `${localBin}:${bunBin}:${systemPath}`;
  if (!settings.env) settings.env = {};
  // Always overwrite — a previous installer run may have written a literal ${PATH}.
  if (settings.env.PATH !== newPath) settings.env.PATH = newPath;
}

function install(): { added: number; replaced: number; unchanged: number } {
  const settings = loadSettings();
  ensureEnv(settings);
  const stats = { added: 0, replaced: 0, unchanged: 0 };
  for (const h of HOOKS) {
    const entries = ensureEvent(settings, h.event);
    const result = upsertEntry(entries, h.signature, h.matcher, h.command);
    stats[result]++;
  }
  saveSettings(settings);
  return stats;
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
  const stats = install();
  console.log(
    `fstack hooks: ${stats.added} added, ${stats.replaced} replaced, ${stats.unchanged} unchanged in ${FILE}`
  );
  console.log(`              binary path embedded: ${BRAIN}`);
}
