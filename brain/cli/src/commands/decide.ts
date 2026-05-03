import { buildCtx } from "../context.ts";
import {
  nextDecisionNumber,
  writeDecision,
  searchDecisions,
} from "../client.ts";
import { emit, emitError } from "../output.ts";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * decide write — create a new ADR row + docs/decisions/NNNN-slug.md file.
 */
export async function decideWrite(args: { title?: string; body?: string }) {
  if (!args.title) emitError("decide write: --title required", 2);
  if (!args.body) emitError("decide write: --body required", 2);

  const ctx = await buildCtx();
  const number = await nextDecisionNumber(ctx.db, ctx.repoId);

  const decision = await writeDecision(ctx.db, {
    repoId: ctx.repoId,
    number,
    title: args.title,
    body: args.body,
    authoredBy: ctx.cfg.agent_id,
  });

  // Also write the markdown ADR file
  const slug = args.title
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
    `**Date:** ${new Date().toISOString().slice(0, 10)}`,
    "",
    args.body,
  ].join("\n");
  writeFileSync(adrPath, md, "utf8");

  emit(
    `decision ${num} written — '${args.title}' (${adrPath})`,
    { ok: true, decision, file: adrPath }
  );
}

/**
 * decide search — keyword search across decisions in this repo.
 */
export async function decideSearch(args: { query?: string; limit?: number }) {
  if (!args.query) emitError("decide search: --query required", 2);
  const ctx = await buildCtx();
  const rows = await searchDecisions(ctx.db, {
    repoId: ctx.repoId,
    query: args.query,
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
