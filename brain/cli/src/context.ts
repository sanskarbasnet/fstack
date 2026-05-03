/**
 * Per-invocation context: config + DB + repo + branch.
 * Most commands need all of these. Fail loudly if not in a git repo.
 */
import { loadConfig, type FstackConfig } from "./config.ts";
import { brain } from "./client.ts";
import { canonicalRemote, currentBranch, defaultBranch, repoRoot } from "./git.ts";
import { ensureBranch, ensureRepo } from "./client.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Ctx = {
  cfg: FstackConfig;
  db: SupabaseClient;
  repoCanonical: string;
  repoId: string;
  branchName: string;
  branchId: string;
  cwd: string;
};

export async function buildCtx(): Promise<Ctx> {
  const cfg = loadConfig();
  const db = brain(cfg);

  const cwd = repoRoot() ?? process.cwd();
  const canonical = canonicalRemote();
  if (!canonical) {
    throw new Error(
      "fstack: no git remote 'origin' found. fstack requires a git repo with origin set."
    );
  }
  const branchName = currentBranch() ?? "HEAD";
  const repoId = await ensureRepo(db, canonical, defaultBranch());
  const branchId = await ensureBranch(db, repoId, branchName);

  return {
    cfg,
    db,
    repoCanonical: canonical,
    repoId,
    branchName,
    branchId,
    cwd,
  };
}
