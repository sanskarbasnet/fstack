import { buildCtx, buildCtxFull } from "../context.ts";
import { searchDecisions, ensureRepo, ensureBranch, ensureFile } from "../client.ts";
import { emit, emitError } from "../output.ts";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { defaultBranch } from "../git.ts";
import { enqueue, reserveDecisionNumber, drainQueue, loadCounters } from "../queue.ts";

/**
 * decide write — local-first.
 *
 * Returns in <100ms by:
 *   1. Reserving the decision number locally (cached counter)
 *   2. Writing the ADR markdown file immediately
 *   3. Queueing the Supabase insert for next drain
 *
 * The ADR file is durable; the brain row is eventually consistent.
 */
export async function decideWrite(args: {
  title?: string;
  body?: string;
  source?: "manual" | "infer";
}) {
  if (!args.title) emitError("decide write: --title required", 2);
  if (!args.body) emitError("decide write: --body required", 2);
  const source = args.source ?? "manual";

  const ctx = buildCtx();
  // reserveDecisionNumber needs a real repoId only on FIRST call per machine
  // (to bootstrap the local counter from Supabase max). On subsequent calls,
  // it hits the local counter cache and skips Supabase entirely.
  const counters = loadCounters();
  let repoIdForBootstrap = ctx.repoId;
  if (counters[ctx.repoCanonical] === undefined) {
    // Cache miss — need a real repoId to bootstrap. One-time hit.
    repoIdForBootstrap = await ensureRepo(ctx.db, ctx.repoCanonical, defaultBranch());
  }
  const number = await reserveDecisionNumber(ctx.db, ctx.repoCanonical, repoIdForBootstrap);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const timeline = [{ at: now, who: ctx.cfg.agent_id, event: "authored" }];

  // 1. Write the ADR file immediately — durable artifact
  const slug = args.title!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
  const num = String(number).padStart(4, "0");
  const adrDir = join(ctx.cwd, "docs", "decisions");
  if (!existsSync(adrDir)) mkdirSync(adrDir, { recursive: true });
  const adrPath = join(adrDir, `${num}-${slug}.md`);
  const md = [
    `# ${num} ${args.title}`,
    "",
    `**Status:** accepted`,
    `**Authored by:** ${ctx.cfg.agent_id}`,
    `**Date:** ${now.slice(0, 10)}`,
    "",
    args.body,
  ].join("\n");
  writeFileSync(adrPath, md, "utf8");

  // 2. Queue the Supabase write
  enqueue({
    op: "decide_write",
    payload: {
      id,
      repo_canonical: ctx.repoCanonical,
      number,
      title: args.title,
      body: args.body,
      authored_by: ctx.cfg.agent_id,
      timeline,
      source,
      created_at: now,
    },
  });

  emit(
    `decision ${num} written — '${args.title}' (${adrPath}) [queued for brain]`,
    {
      ok: true,
      decision: {
        id,
        number,
        title: args.title,
        authored_by: ctx.cfg.agent_id,
        source,
      },
      file: adrPath,
      queued: true,
    }
  );
}

// ---------------------------------------------------------------------------
// decide infer — auto-detect decisions in user prompts via regex pre-filter.
// Wired into UserPromptSubmit hook so nothing gets missed.
// ---------------------------------------------------------------------------

// Decision-shaped patterns. Catch present-tense and past-tense commitments.
// Subjunctive ("we could use Z") and questions ("should we use Y?") are
// filtered out earlier by the heuristic guards.
const DECISION_PATTERNS: RegExp[] = [
  /\blet'?s\s+(go|use|do|commit|stick|pick|switch|adopt|build|kill|drop|skip|defer)\b/i,
  /\bdecided?(\s+to)?\b/i,
  /\bgoing\s+with\b/i,
  /\bsettled\s+on\b/i,
  /\bsticking\s+(with|to)\b/i,
  /\binstead\s+of\b/i,
  /\bwe('?ll|'?re)\s+(use|using|go|going|pick|picking|stick|sticking|commit|committing|switch|switching|build|building|kill|killing|drop|dropping|skip|skipping|defer|deferring)\b/i,
  /\b(committing|committed)\s+to\b/i,
  /\bpivot(ing|ed)\b/i,
  /\bditch(ing|ed)?\b/i,
  /\b(rip|ripping|rip\s+out|removing|deleting)\s+the\b/i,
  /\bdeprecat(e|ing|ed)\b/i,
  /\bsuperseded?\s+by\b/i,
  /\b(no|don'?t)\s+(use|do|build|ship)\b/i,
];

// Words that indicate a question or hypothetical — skip even if a pattern hits.
const SKIP_PREFIXES = [
  "what", "why", "how", "where", "when", "which", "who",
  "should we", "should i", "can you", "could you", "would you",
  "is it", "are we", "do we", "does this",
];

// Subjunctive-ish hedges that turn statements into hypotheticals.
const HEDGE_TOKENS = [
  "maybe", "perhaps", "might", "could (we|i)", "thinking about", "considering",
  "what if", "wonder(ing)? if",
];

function looksLikeDecision(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (trimmed.length < 30) return false;
  if (trimmed.endsWith("?")) return false;

  const lower = trimmed.toLowerCase();
  for (const pre of SKIP_PREFIXES) {
    if (lower.startsWith(pre + " ") || lower.startsWith(pre + ",")) return false;
  }
  for (const hedge of HEDGE_TOKENS) {
    if (new RegExp(`\\b${hedge}\\b`, "i").test(trimmed)) return false;
  }
  for (const pat of DECISION_PATTERNS) {
    if (pat.test(trimmed)) return true;
  }
  return false;
}

// Local dedup cache. Same prompt fired within COOLDOWN_MS = no re-write.
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const RECENT_PATH = join(homedir(), ".fstack", "decide-infer-recent.json");

function loadRecent(): Record<string, number> {
  try {
    if (!existsSync(RECENT_PATH)) return {};
    const raw = readFileSync(RECENT_PATH, "utf8");
    const obj = JSON.parse(raw) as Record<string, number>;
    // Garbage-collect old entries so the file doesn't grow forever.
    const now = Date.now();
    const fresh: Record<string, number> = {};
    for (const [k, ts] of Object.entries(obj)) {
      if (now - ts < COOLDOWN_MS * 4) fresh[k] = ts;
    }
    return fresh;
  } catch {
    return {};
  }
}

function saveRecent(map: Record<string, number>) {
  try {
    const dir = join(homedir(), ".fstack");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(RECENT_PATH, JSON.stringify(map), "utf8");
  } catch {
    // Best-effort; never block the hook.
  }
}

function promptHash(prompt: string, repo: string): string {
  return createHash("sha256")
    .update(repo + "::" + prompt.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 16);
}

/**
 * decide infer — fires from UserPromptSubmit hook on every user prompt.
 *
 * Pure-local detector: regex pre-filter + heuristic guards. No LLM call.
 * If the prompt looks decision-shaped AND we haven't logged a near-duplicate
 * in the last 5 minutes, auto-writes a decision with source='infer'.
 *
 * Honors FSTACK_DECIDE_INFER_OFF=1 for emergency disable.
 *
 * Never blocks the hook on errors — all failure modes emit ok:true with a
 * skip reason and exit 0. The agent should not see noise.
 */
export async function decideInfer(args: { prompt?: string }) {
  if (process.env.FSTACK_DECIDE_INFER_OFF === "1") {
    emit("decide infer: disabled via FSTACK_DECIDE_INFER_OFF", {
      ok: true,
      skipped: "disabled",
    });
    return;
  }
  if (!args.prompt) {
    emit("decide infer: --prompt required, skipping", {
      ok: true,
      skipped: "no-prompt",
    });
    return;
  }
  if (!looksLikeDecision(args.prompt)) {
    emit("decide infer: not decision-shaped, skipping", {
      ok: true,
      skipped: "no-match",
    });
    return;
  }

  let ctx;
  try {
    ctx = buildCtx();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not inside a git repo")) {
      emit("decide infer: skipped (not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }

  const hash = promptHash(args.prompt, ctx.repoCanonical);
  const recent = loadRecent();
  const last = recent[hash];
  if (last && Date.now() - last < COOLDOWN_MS) {
    emit("decide infer: duplicate within cooldown, skipping", {
      ok: true,
      skipped: "duplicate",
    });
    return;
  }

  // Title: first sentence (or first 80 chars). Body: full prompt up to 1500.
  const firstSentence = args.prompt.trim().split(/[.!\n]/)[0]?.trim() ?? args.prompt.trim();
  const title = firstSentence.slice(0, 80) || args.prompt.trim().slice(0, 80);
  const body = [
    "**Decision (auto-detected from prompt):**",
    "",
    args.prompt.trim().slice(0, 1500),
    "",
    "---",
    "_Source: infer (auto-logged by UserPromptSubmit hook). Refine with `/decide` if needed._",
  ].join("\n");

  // Mark recent BEFORE the write — even if write fails, don't retry the same
  // prompt repeatedly.
  recent[hash] = Date.now();
  saveRecent(recent);

  await decideWrite({ title, body, source: "infer" });
}

/**
 * decide search — drain queue first so just-written decisions surface, then
 * hit Supabase.
 */
export async function decideSearch(args: { query?: string; limit?: number }) {
  if (!args.query) emitError("decide search: --query required", 2);
  const ctx = await buildCtxFull();

  // Drain queued writes so search sees fresh data
  await drainQueue(
    ctx.db,
    async (canonical) => ensureRepo(ctx.db, canonical, defaultBranch()),
    async (repoId, branchName) => ensureBranch(ctx.db, repoId, branchName),
    async (repoId, path) => ensureFile(ctx.db, repoId, path)
  );

  const rows = await searchDecisions(ctx.db, {
    repoId: ctx.repoId,
    query: args.query!,
    limit: args.limit ?? 10,
  });
  if (rows.length === 0) {
    emit("(no matching decisions)", { ok: true, decisions: [] });
    return;
  }
  const lines = rows.map((d: any) => {
    const num = String(d.number).padStart(4, "0");
    return `${num} ${d.title} — by ${d.authored_by} (${d.status})`;
  });
  emit(lines.join("\n"), { ok: true, decisions: rows });
}
