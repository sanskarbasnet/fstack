import { buildCtxFull } from "../context.ts";
import {
  ensureRepo,
  ensureBranch,
  ensureFile,
} from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";

/**
 * coordinate --topic "<text>" — brain-wide collision check.
 *
 * Returns:
 *   - active overlapping intents from OTHER agents (intent_status='active')
 *   - intents shipped in the last 7d that match the topic (file overlap)
 *   - related decisions whose body/title match the topic keywords
 *
 * Used by /coordinate skill (manual) AND by UserPromptSubmit hook (auto).
 *
 * Empty report = green light. Non-empty = surface to user with pivots.
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

  // Extract keywords from the topic for ILIKE matching
  const keywords = extractKeywords(args.topic);
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

  // Render
  const hasOverlap = active_overlaps.length > 0;
  const lines: string[] = [];
  if (hasOverlap) {
    lines.push(`⚠ Coordinate: ${active_overlaps.length} active overlap(s)`);
    for (const i of active_overlaps) {
      lines.push(`  • ${i.agent_id}: "${i.title}"`);
    }
  } else {
    lines.push("✓ Coordinate: no active overlaps — clear to proceed.");
  }
  if (shipped_recent.length > 0) {
    lines.push("");
    lines.push(`Recently shipped in this area (last 7d, ${shipped_recent.length}):`);
    for (const i of shipped_recent.slice(0, 5)) {
      const pr = i.pr_url ? ` (${i.pr_url})` : "";
      lines.push(`  • ${i.agent_id}: ${i.title}${pr}`);
    }
  }
  if (related_decisions.length > 0) {
    lines.push("");
    lines.push(`Related decisions (${related_decisions.length}):`);
    for (const d of related_decisions.slice(0, 5)) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title} (by ${d.authored_by})`);
    }
  }

  emit(lines.join("\n"), {
    ok: true,
    has_overlap: hasOverlap,
    active_overlaps,
    shipped_recent,
    related_decisions,
    keywords,
  });
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
