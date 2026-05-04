import { execSync } from "node:child_process";
import { isAbsolute, relative } from "node:path";
import { buildCtxFull } from "../context.ts";
import { ensureRepo, ensureBranch, ensureFile } from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";

/**
 * blame --file P [--line N] — brain-aware blame.
 *
 * Combines git blame (who/when/commit) with the brain (which intent
 * introduced this work, decisions affecting the file, recent edits).
 *
 * If --line is given: git blame -L N,N to find the exact commit.
 * Otherwise: returns file-level blame summary + brain context.
 */
export async function blameCmd(args: { file?: string; line?: number }) {
  if (!args.file) {
    emit("blame: --file required", { ok: false });
    process.exit(2);
  }
  const ctx = await buildCtxFull();
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );

  // Resolve relative path
  const file = isAbsolute(args.file!) ? relative(ctx.cwd, args.file!) : args.file!;

  // Run git blame
  let commit = "";
  let author = "";
  let date = "";
  let lineContent = "";
  try {
    const args_blame = args.line
      ? ["blame", "-L", `${args.line},${args.line}`, "--porcelain", "--", file]
      : ["blame", "-L", "1,1", "--porcelain", "--", file];
    const out = execSync(`git ${args_blame.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`, {
      cwd: ctx.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const lines = out.split("\n");
    commit = (lines[0] || "").split(" ")[0] ?? "";
    for (const l of lines) {
      if (l.startsWith("author ")) author = l.slice(7);
      if (l.startsWith("author-time ")) {
        const ts = parseInt(l.slice("author-time ".length), 10);
        if (!isNaN(ts)) date = new Date(ts * 1000).toISOString().slice(0, 10);
      }
      if (l.startsWith("\t")) lineContent = l.slice(1);
    }
  } catch (err: any) {
    emit(`blame: git blame failed: ${err?.message ?? err}`, { ok: false });
    return;
  }

  // Find file row + edits
  const { data: fileRow } = await ctx.db
    .from("files")
    .select("id, path")
    .eq("repo_id", ctx.repoId)
    .eq("path", file)
    .maybeSingle();

  let edits: any[] = [];
  let related_intents: any[] = [];
  let decisions: any[] = [];
  if (fileRow?.id) {
    // Recent edits on this file
    const { data: editsData } = await ctx.db
      .from("edits")
      .select("op, summary, created_at, agent_id, intent_id")
      .eq("file_id", fileRow.id)
      .order("created_at", { ascending: false })
      .limit(10);
    edits = editsData ?? [];

    // Intents that touched this file
    const intentIds = Array.from(new Set(edits.map((e: any) => e.intent_id)));
    if (intentIds.length > 0) {
      const { data } = await ctx.db
        .from("intents")
        .select("id, title, status, agent_id")
        .in("id", intentIds);
      related_intents = data ?? [];
    }

    // Decisions referencing this file (heuristic: ILIKE %file%)
    const { data: decData } = await ctx.db
      .from("decisions")
      .select("number, title, authored_by, created_at")
      .eq("repo_id", ctx.repoId)
      .or(`title.ilike.%${file}%,body.ilike.%${file}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    decisions = decData ?? [];
  }

  // Render
  const lines: string[] = [];
  const where = args.line ? `${file}:${args.line}` : file;
  lines.push(`blame: ${where}`);
  if (commit) {
    lines.push(`  commit:  ${commit.slice(0, 8)} by ${author || "?"} on ${date || "?"}`);
  }
  if (lineContent) {
    lines.push(`  line:    ${lineContent.trim().slice(0, 100)}`);
  }
  lines.push("");

  if (related_intents.length > 0) {
    lines.push("Intents that touched this file:");
    for (const i of related_intents) {
      lines.push(`  • ${i.agent_id} [${i.status}] — ${i.title}`);
    }
    lines.push("");
  }

  if (decisions.length > 0) {
    lines.push("Decisions affecting this file:");
    for (const d of decisions) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title} (by ${d.authored_by})`);
    }
    lines.push("");
  }

  if (edits.length > 0) {
    lines.push(`Recent edits in brain (last ${edits.length}):`);
    for (const e of edits.slice(0, 5)) {
      const summary = e.summary ? ` — ${e.summary}` : "";
      lines.push(`  • ${e.created_at.slice(0, 10)} ${e.agent_id} [${e.op}]${summary}`);
    }
  }

  if (related_intents.length === 0 && decisions.length === 0 && edits.length === 0) {
    lines.push("(no brain context for this file yet)");
  }

  emit(lines.join("\n"), {
    ok: true,
    file,
    line: args.line ?? null,
    commit: commit || null,
    author: author || null,
    date: date || null,
    line_content: lineContent || null,
    related_intents,
    decisions,
    edits,
  });
}
