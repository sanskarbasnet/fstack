import { buildCtxFull, type Ctx } from "../context.ts";
import {
  ensureRepo,
  ensureBranch,
  ensureFile,
} from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";

export type CoordinateResult = {
  has_overlap: boolean;
  active_overlaps: any[];
  shipped_recent: any[];
  related_decisions: any[];
  keywords: string[];
  /** True when there's anything worth surfacing to the user. */
  has_signal: boolean;
};

/**
 * Pure function: run the coordinate query against an existing context.
 * Returns structured data; never emits. Callable from intent_infer hook
 * to fold collision checks into intent drafting.
 */
export async function runCoordinate(
  ctx: Ctx,
  topic: string
): Promise<CoordinateResult> {
  const keywords = extractKeywords(topic);
  const orClauses = keywords.length
    ? keywords.map((k) => `title.ilike.%${k}%,body.ilike.%${k}%`).join(",")
    : "";

  // 1. OTHER agents' active intents in this repo, ranked by topic match
  const activeQ = ctx.db
    .from("intents")
    .select("id, agent_id, title, body, created_at, branch_id")
    .eq("repo_id", ctx.repoId)
    .eq("status", "active")
    .neq("agent_id", ctx.cfg.agent_id);
  const { data: activeData } = orClauses
    ? await activeQ.or(orClauses)
    : await activeQ;
  const active_overlaps = (activeData ?? []).slice(0, 10);

  // 2. Shipped intents in last 7 days matching topic
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  let shipped_recent: any[] = [];
  if (orClauses) {
    const { data } = await ctx.db
      .from("intents")
      .select("id, agent_id, title, pr_url, shipped_at")
      .eq("repo_id", ctx.repoId)
      .eq("status", "shipped")
      .gte("shipped_at", since)
      .or(orClauses)
      .order("shipped_at", { ascending: false })
      .limit(10);
    shipped_recent = data ?? [];
  }

  // 3. Related decisions
  let related_decisions: any[] = [];
  if (orClauses) {
    const { data } = await ctx.db
      .from("decisions")
      .select("number, title, authored_by, created_at")
      .eq("repo_id", ctx.repoId)
      .or(orClauses)
      .order("created_at", { ascending: false })
      .limit(10);
    related_decisions = data ?? [];
  }

  const has_overlap = active_overlaps.length > 0;
  return {
    has_overlap,
    active_overlaps,
    shipped_recent,
    related_decisions,
    keywords,
    has_signal:
      has_overlap || shipped_recent.length > 0 || related_decisions.length > 0,
  };
}

/**
 * Format a CoordinateResult as a short multi-line warning suitable for
 * embedding in an intent body or printing to the user.
 */
export function formatCoordinateWarning(r: CoordinateResult): string {
  const lines: string[] = [];
  if (r.active_overlaps.length > 0) {
    lines.push(`⚠ ${r.active_overlaps.length} active overlap(s):`);
    for (const i of r.active_overlaps.slice(0, 5)) {
      lines.push(`  • ${i.agent_id}: "${i.title}"`);
    }
  }
  if (r.shipped_recent.length > 0) {
    lines.push(`Recently shipped (last 7d):`);
    for (const i of r.shipped_recent.slice(0, 3)) {
      lines.push(`  • ${i.agent_id}: ${i.title}`);
    }
  }
  if (r.related_decisions.length > 0) {
    lines.push(`Related decisions:`);
    for (const d of r.related_decisions.slice(0, 3)) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title}`);
    }
  }
  return lines.join("\n");
}

/**
 * coordinate --topic "<text>" — CLI handler. Wraps runCoordinate + emit.
 */
export async function coordinate(args: { topic?: string }) {
  if (!args.topic) {
    emit("coordinate: --topic required", { ok: false });
    process.exit(2);
  }
  let ctx;
  try {
    ctx = await buildCtxFull();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not inside a git repo")) {
      emit("coordinate: skipped (not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }

  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );

  const r = await runCoordinate(ctx, args.topic);

  const lines: string[] = [];
  if (r.has_overlap) {
    lines.push(`⚠ Coordinate: ${r.active_overlaps.length} active overlap(s)`);
    for (const i of r.active_overlaps) {
      lines.push(`  • ${i.agent_id}: "${i.title}"`);
    }
  } else {
    lines.push("✓ Coordinate: no active overlaps — clear to proceed.");
  }
  if (r.shipped_recent.length > 0) {
    lines.push("");
    lines.push(
      `Recently shipped in this area (last 7d, ${r.shipped_recent.length}):`
    );
    for (const i of r.shipped_recent.slice(0, 5)) {
      const pr = i.pr_url ? ` (${i.pr_url})` : "";
      lines.push(`  • ${i.agent_id}: ${i.title}${pr}`);
    }
  }
  if (r.related_decisions.length > 0) {
    lines.push("");
    lines.push(`Related decisions (${r.related_decisions.length}):`);
    for (const d of r.related_decisions.slice(0, 5)) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title} (by ${d.authored_by})`);
    }
  }

  emit(lines.join("\n"), { ok: true, ...r });
}

const STOPWORDS = new Set([
  "the","a","an","to","for","of","and","or","in","on","with","add","build",
  "make","new","fix","update","improve","let","s","i","we","need","want","this",
  "that","at","by","be","is","are","do","my","our","your","its","it",
]);

function extractKeywords(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_/]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 6);
}
