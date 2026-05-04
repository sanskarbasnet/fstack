/**
 * Local-first write queue.
 *
 * Writes append a JSONL line to ~/.fstack/queue/writes.jsonl + update local
 * caches for read-after-write semantics, then return immediately.
 *
 * Reads drain the queue (flush queued writes to Supabase) before querying.
 * No daemon: drains happen at the start of every read op (sync, presence,
 * standup, why, decide search, handoff list) and SessionEnd.
 *
 * Failure semantics: a failed flush row stays in the queue and will be
 * retried on the next drain. Local caches are authoritative for the writer
 * even before flush.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const FSTACK_HOME = process.env.FSTACK_HOME ?? join(homedir(), ".fstack");
const QUEUE_DIR = join(FSTACK_HOME, "queue");
const CACHE_DIR = join(FSTACK_HOME, "cache");
const QUEUE_FILE = join(QUEUE_DIR, "writes.jsonl");
const FLUSH_LOCK = join(QUEUE_DIR, ".flush.lock");

function ensureDirs() {
  if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true });
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// Queue write surface — append-only
// -----------------------------------------------------------------------------

export type QueueOp =
  | { op: "intent_write"; payload: any }
  | { op: "intent_pause"; payload: { intent_id: string } }
  | { op: "intent_ship"; payload: any }
  | { op: "decide_write"; payload: any }
  | { op: "handoff_write"; payload: any }
  | { op: "edit_log"; payload: any }
  | { op: "heartbeat"; payload: any }
  | { op: "wishlist_add"; payload: any };

export type QueueEntry = QueueOp & {
  id: string;
  enqueued_at: string;
  attempts: number;
};

export function enqueue(op: QueueOp): QueueEntry {
  ensureDirs();
  const entry: QueueEntry = {
    ...op,
    id: crypto.randomUUID(),
    enqueued_at: new Date().toISOString(),
    attempts: 0,
  };
  appendFileSync(QUEUE_FILE, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

export function queueDepth(): number {
  if (!existsSync(QUEUE_FILE)) return 0;
  const raw = readFileSync(QUEUE_FILE, "utf8");
  return raw.split("\n").filter(Boolean).length;
}

// -----------------------------------------------------------------------------
// Local caches — keyed by repo canonical for cross-repo isolation
// -----------------------------------------------------------------------------

type IntentCache = {
  // key: `${repo_canonical}::${branch_name}::${agent_id}`
  active: Record<string, any>;
};

function intentCachePath(): string {
  return join(CACHE_DIR, "intents.json");
}

export function loadIntentCache(): IntentCache {
  ensureDirs();
  const p = intentCachePath();
  if (!existsSync(p)) return { active: {} };
  try {
    return JSON.parse(readFileSync(p, "utf8")) as IntentCache;
  } catch {
    return { active: {} };
  }
}

export function saveIntentCache(cache: IntentCache): void {
  ensureDirs();
  const p = intentCachePath();
  const tmp = p + "." + Date.now() + ".tmp";
  writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
  renameSync(tmp, p);
}

export function intentCacheKey(
  repoCanonical: string,
  branch: string,
  agentId: string
): string {
  return `${repoCanonical}::${branch}::${agentId}`;
}

export function getCachedIntent(
  repoCanonical: string,
  branch: string,
  agentId: string
): any | null {
  const cache = loadIntentCache();
  const k = intentCacheKey(repoCanonical, branch, agentId);
  return cache.active[k] ?? null;
}

export function setCachedIntent(
  repoCanonical: string,
  branch: string,
  agentId: string,
  intent: any | null
): void {
  const cache = loadIntentCache();
  const k = intentCacheKey(repoCanonical, branch, agentId);
  if (intent === null) delete cache.active[k];
  else cache.active[k] = intent;
  saveIntentCache(cache);
}

// -----------------------------------------------------------------------------
// Drain — read commands call this first
// -----------------------------------------------------------------------------

/**
 * Drain pending writes to Supabase. Best-effort: any failure leaves the entry
 * in the queue for next attempt.
 *
 * Returns { flushed, remaining, errors } for logging.
 */
export async function drainQueue(
  db: SupabaseClient,
  resolveRepo: (canonical: string) => Promise<string>,
  resolveBranch: (repoId: string, branchName: string) => Promise<string>,
  resolveFile: (repoId: string, path: string) => Promise<string>
): Promise<{ flushed: number; remaining: number; errors: string[] }> {
  ensureDirs();
  if (!existsSync(QUEUE_FILE)) {
    return { flushed: 0, remaining: 0, errors: [] };
  }

  // Concurrency guard: only one drain at a time. mkdir is atomic on POSIX.
  try {
    mkdirSync(FLUSH_LOCK);
  } catch {
    return { flushed: 0, remaining: queueDepth(), errors: ["drain locked"] };
  }

  const errors: string[] = [];
  let flushed = 0;

  try {
    const raw = readFileSync(QUEUE_FILE, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    const remaining: string[] = [];

    for (const line of lines) {
      let entry: QueueEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        // malformed line — skip but keep so user can inspect
        remaining.push(line);
        continue;
      }

      try {
        await applyOp(entry, db, resolveRepo, resolveBranch, resolveFile);
        flushed++;
      } catch (err: any) {
        entry.attempts = (entry.attempts ?? 0) + 1;
        errors.push(
          `${entry.op}#${entry.id.slice(0, 8)}: ${String(err?.message ?? err).slice(0, 120)}`
        );
        remaining.push(JSON.stringify(entry));
      }
    }

    // Rewrite queue with remaining entries (atomic via tmp+rename)
    const tmp = QUEUE_FILE + "." + Date.now() + ".tmp";
    writeFileSync(tmp, remaining.length ? remaining.join("\n") + "\n" : "", "utf8");
    renameSync(tmp, QUEUE_FILE);

    return { flushed, remaining: remaining.length, errors };
  } finally {
    try {
      // remove lock (rmdir on the lock-dir path)
      const { rmdirSync } = await import("node:fs");
      rmdirSync(FLUSH_LOCK);
    } catch {
      // best-effort
    }
  }
}

// -----------------------------------------------------------------------------
// applyOp — translate a queue entry into Supabase calls
// -----------------------------------------------------------------------------

async function applyOp(
  entry: QueueEntry,
  db: SupabaseClient,
  resolveRepo: (canonical: string) => Promise<string>,
  resolveBranch: (repoId: string, branchName: string) => Promise<string>,
  resolveFile: (repoId: string, path: string) => Promise<string>
): Promise<void> {
  switch (entry.op) {
    case "intent_write": {
      const p = entry.payload;
      const repoId = await resolveRepo(p.repo_canonical);
      const branchId = await resolveBranch(repoId, p.branch_name);
      const { error } = await db.from("intents").insert({
        id: p.id,
        agent_id: p.agent_id,
        repo_id: repoId,
        branch_id: branchId,
        title: p.title,
        body: p.body ?? null,
        promises: p.promises ?? null,
        not_touching: p.not_touching ?? null,
        inferred: p.inferred ?? false,
        status: "active",
        created_at: p.created_at,
        updated_at: p.created_at,
      });
      if (error) throw error;
      return;
    }
    case "intent_pause": {
      const { error } = await db
        .from("intents")
        .update({ status: "paused" })
        .eq("id", entry.payload.intent_id);
      if (error) throw error;
      return;
    }
    case "intent_ship": {
      const p = entry.payload;
      const { error } = await db
        .from("intents")
        .update({
          status: "shipped",
          shipped_at: p.shipped_at,
          pr_url: p.pr_url ?? null,
        })
        .eq("id", p.intent_id);
      if (error) throw error;
      return;
    }
    case "decide_write": {
      const p = entry.payload;
      const repoId = await resolveRepo(p.repo_canonical);
      const { error } = await db.from("decisions").insert({
        id: p.id,
        repo_id: repoId,
        number: p.number,
        title: p.title,
        body: p.body,
        authored_by: p.authored_by,
        timeline: p.timeline,
        created_at: p.created_at,
      });
      if (error) throw error;
      return;
    }
    case "handoff_write": {
      const p = entry.payload;
      const repoId = await resolveRepo(p.repo_canonical);
      const { error } = await db.from("handoffs").insert({
        id: p.id,
        repo_id: repoId,
        intent_id: p.intent_id ?? null,
        from_agent: p.from_agent,
        to_agent: p.to_agent ?? null,
        branch_name: p.branch_name ?? null,
        note: p.note,
        blocker: p.blocker ?? null,
        next_step: p.next_step ?? null,
        uncommitted_files: p.uncommitted_files ?? [],
        auto_generated: p.auto_generated ?? false,
        created_at: p.created_at,
      });
      if (error) throw error;
      return;
    }
    case "edit_log": {
      const p = entry.payload;
      const repoId = await resolveRepo(p.repo_canonical);
      const fileId = await resolveFile(repoId, p.file_path);
      const { error } = await db.from("edits").insert({
        intent_id: p.intent_id,
        agent_id: p.agent_id,
        file_id: fileId,
        op: p.op,
        summary: p.summary ?? null,
        created_at: p.created_at,
      });
      if (error) throw error;
      return;
    }
    case "heartbeat": {
      const p = entry.payload;
      const repoId = await resolveRepo(p.repo_canonical);
      const { error } = await db.from("presence").upsert(
        {
          agent_id: p.agent_id,
          repo_id: repoId,
          branch_name: p.branch_name ?? null,
          intent_id: p.intent_id ?? null,
          status: p.status,
          active_files: p.active_files ?? [],
          last_heartbeat: p.last_heartbeat,
          machine: p.machine ?? null,
        },
        { onConflict: "agent_id,repo_id" }
      );
      if (error) throw error;
      return;
    }
    case "wishlist_add": {
      const p = entry.payload;
      const repoId = await resolveRepo(p.repo_canonical);
      const { error } = await db.from("wishlist").insert({
        id: p.id,
        agent_id: p.agent_id,
        repo_id: repoId,
        title: p.title,
        body: p.body ?? null,
        tags: p.tags ?? [],
        created_at: p.created_at,
        updated_at: p.created_at,
      });
      if (error) throw error;
      return;
    }
  }
}

// -----------------------------------------------------------------------------
// Decision-number allocator (local-first)
// -----------------------------------------------------------------------------

/**
 * Reserve the next decision number locally. Claims a sequential integer per
 * repo, persisted in ~/.fstack/cache/decision-counters.json. Reads existing
 * Supabase max once if the local counter is unset (boot-strap).
 *
 * Caveat: if both agents allocate offline simultaneously, they may collide.
 * The flush will surface a unique-constraint violation; we retry-with-bump.
 */
type CounterCache = Record<string, number>; // canonical -> next number to use

function counterCachePath(): string {
  return join(CACHE_DIR, "decision-counters.json");
}

export function loadCounters(): CounterCache {
  ensureDirs();
  const p = counterCachePath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CounterCache;
  } catch {
    return {};
  }
}

export function saveCounters(c: CounterCache): void {
  ensureDirs();
  const p = counterCachePath();
  const tmp = p + "." + Date.now() + ".tmp";
  writeFileSync(tmp, JSON.stringify(c, null, 2), "utf8");
  renameSync(tmp, p);
}

/**
 * Claim the next decision number for this repo. If unseen, fetch the current
 * max from Supabase once, then increment locally going forward.
 */
export async function reserveDecisionNumber(
  db: SupabaseClient,
  repoCanonical: string,
  repoId: string
): Promise<number> {
  const counters = loadCounters();
  if (counters[repoCanonical] !== undefined) {
    const n = counters[repoCanonical]!;
    counters[repoCanonical] = n + 1;
    saveCounters(counters);
    return n;
  }
  // First time: bootstrap from Supabase max
  const { data, error } = await db.rpc("next_decision_number", { p_repo_id: repoId });
  if (error) throw error;
  const n = data as number;
  counters[repoCanonical] = n + 1;
  saveCounters(counters);
  return n;
}

export const PATHS_FOR_TESTS = { QUEUE_DIR, CACHE_DIR, QUEUE_FILE };
