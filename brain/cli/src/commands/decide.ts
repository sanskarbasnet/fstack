import { buildCtx, buildCtxFull } from "../context.ts";
import { searchDecisions, ensureRepo, ensureBranch, ensureFile } from "../client.ts";
import { emit, emitError } from "../output.ts";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
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
export async function decideWrite(args: { title?: string; body?: string }) {
  if (!args.title) emitError("decide write: --title required", 2);
  if (!args.body) emitError("decide write: --body required", 2);

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
      created_at: now,
    },
  });

  emit(
    `decision ${num} written — '${args.title}' (${adrPath}) [queued for brain]`,
    {
      ok: true,
      decision: { id, number, title: args.title, authored_by: ctx.cfg.agent_id },
      file: adrPath,
      queued: true,
    }
  );
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
