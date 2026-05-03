import { buildCtx } from "../context.ts";
import { emit } from "../output.ts";
import { ensureFile } from "../client.ts";
import { relative, isAbsolute } from "node:path";

/**
 * why <file>  — find decisions, intents, and recent edits attached to a file.
 */
export async function whyCmd(args: { target?: string }) {
  if (!args.target) {
    emit("why: target file required", { ok: false });
    process.exit(2);
  }
  const ctx = await buildCtx();
  const path = isAbsolute(args.target)
    ? relative(ctx.cwd, args.target)
    : args.target;
  const fileId = await ensureFile(ctx.db, ctx.repoId, path);

  const [decisionsRes, editsRes] = await Promise.all([
    ctx.db
      .from("decision_files")
      .select("decisions(id, number, title, status, authored_by, created_at, body)")
      .eq("file_id", fileId),
    ctx.db
      .from("edits")
      .select("op, summary, created_at, agent_id, intents!inner(id, title, status)")
      .eq("file_id", fileId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const decisions = (decisionsRes.data ?? []).map((r: any) => r.decisions);
  const edits = editsRes.data ?? [];

  const lines: string[] = [`why: ${path}`, ""];

  if (decisions.length === 0) {
    lines.push("Decisions: (none attached)");
  } else {
    lines.push("Decisions affecting this file:");
    for (const d of decisions as any[]) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title} — by ${d.authored_by}, ${d.status}`);
    }
  }
  lines.push("");
  if (edits.length === 0) {
    lines.push("Edits: (none recorded)");
  } else {
    lines.push("Recent edits:");
    for (const e of edits as any[]) {
      const intent = e.intents?.title ? ` "${e.intents.title}"` : "";
      lines.push(`  • [${e.op}] ${e.created_at.slice(0, 10)} ${e.agent_id}${intent}`);
      if (e.summary) lines.push(`      ${e.summary}`);
    }
  }
  emit(lines.join("\n"), { ok: true, decisions, edits });
}
