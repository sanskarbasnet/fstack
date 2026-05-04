/**
 * Per-invocation context: config + DB + repo + branch.
 *
 * Two flavours:
 *   - buildCtx (writes): local-only — no Supabase round-trips. Returns
 *     repoCanonical + branchName + cwd. repoId/branchId resolved lazily at
 *     drain time. Fast (~50ms).
 *   - buildCtxFull (reads): same plus ensureRepo + ensureBranch round-trips
 *     (cached locally so subsequent reads are fast).
 *
 * Both fail loudly if not in a git repo.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, type FstackConfig } from "./config.ts";
import { brain } from "./client.ts";
import { canonicalRemote, currentBranch, defaultBranch, repoRoot } from "./git.ts";
import { ensureBranch, ensureRepo } from "./client.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

const CACHE_DIR = join(process.env.FSTACK_HOME ?? join(homedir(), ".fstack"), "cache");

export type Ctx = {
  cfg: FstackConfig;
  db: SupabaseClient;
  repoCanonical: string;
  /** undefined for the lite build — resolved lazily during drain */
  repoId: string;
  branchName: string;
  /** undefined for the lite build — resolved lazily during drain */
  branchId: string;
  cwd: string;
};

// -----------------------------------------------------------------------------
// Local id caches — populated by full build, read by lite build
// -----------------------------------------------------------------------------

type RepoCache = Record<string, string>; // canonical -> uuid
type BranchCache = Record<string, string>; // `${canonical}::${name}` -> uuid

function readCache<T>(name: string, fallback: T): T {
  const p = join(CACHE_DIR, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeCache(name: string, data: unknown): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const p = join(CACHE_DIR, name);
  const tmp = p + "." + Date.now() + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, p);
}

/**
 * Local-only context. No Supabase. Fast.
 *
 * repoId/branchId come from cache if previously resolved; otherwise they're
 * empty strings — caller must NOT rely on them. Writes that go through the
 * queue resolve at drain time using repoCanonical + branchName.
 */
export function buildCtx(): Ctx {
  const cfg = loadConfig();
  const db = brain(cfg);
  const cwd = repoRoot() ?? process.cwd();
  const canonical = canonicalRemote();
  if (!canonical) {
    throw new Error(
      "fstack: not inside a git repo. fstack-brain operates per-repo; cd into one and try again."
    );
  }
  const branchName = currentBranch() ?? "HEAD";

  // Try local id cache (populated by previous read-path runs)
  const repoCache = readCache<RepoCache>("repos.json", {});
  const branchCache = readCache<BranchCache>("branches.json", {});
  const repoId = repoCache[canonical] ?? "";
  const branchId = branchCache[`${canonical}::${branchName}`] ?? "";

  return { cfg, db, repoCanonical: canonical, repoId, branchName, branchId, cwd };
}

/**
 * Full context with resolved Supabase ids. Used by reads. Caches results.
 */
export async function buildCtxFull(): Promise<Ctx> {
  const ctx = buildCtx();

  if (ctx.repoId && ctx.branchId) return ctx;

  // Populate via Supabase, cache for next time
  const repoId = ctx.repoId || (await ensureRepo(ctx.db, ctx.repoCanonical, defaultBranch()));
  const branchId =
    ctx.branchId || (await ensureBranch(ctx.db, repoId, ctx.branchName));

  if (!ctx.repoId) {
    const cache = readCache<RepoCache>("repos.json", {});
    cache[ctx.repoCanonical] = repoId;
    writeCache("repos.json", cache);
  }
  if (!ctx.branchId) {
    const cache = readCache<BranchCache>("branches.json", {});
    cache[`${ctx.repoCanonical}::${ctx.branchName}`] = branchId;
    writeCache("branches.json", cache);
  }

  return { ...ctx, repoId, branchId };
}
