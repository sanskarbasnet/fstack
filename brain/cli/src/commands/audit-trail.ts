import { buildCtxFull } from "../context.ts";
import { ensureRepo, ensureBranch, ensureFile } from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";
import { isAbsolute, relative } from "node:path";

/**
 * audit-trail --target <file-or-feature>
 *
 * Returns the full chronological story for a target: decisions logged,
 * intents started/shipped, edits made, handoffs created. Different from
 * /why (file-level only) — this is the full timeline with PR URLs and
 * cross-event ordering.
 *
 * Heuristic for target resolution:
 *   - if it looks like a file path (contains /, ., or matches an existing
 *     file row), treat as file
 *   - otherwise treat as a free-text "feature" and ILIKE match across
 *     intent titles + decision titles + handoff notes
 */
export async function auditTrail(args: { target?: string }) {
  if (!args.target) {
    emit("audit-trail: --target required (file path or feature name)", {
      ok: false,
    });
    process.exit(2);
  }
  const ctx = await buildCtxFull();
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );

  const looksLikeFile = /[/.]/.test(args.target!) ||
    args.target!.endsWith("ts") ||
    args.target!.endsWith("js") ||
    args.target!.endsWith("py") ||
    args.target!.endsWith("md");

  // Build event stream
  const events: Array<{
    at: string;
    kind: string;
    author: string;
    text: string;
    detail?: string;
  }> = [];

  if (looksLikeFile) {
    const file = isAbsolute(args.target!) ? relative(ctx.cwd, args.target!) : args.target!;

    // file-scoped: edits + intents that touched it + decisions referencing it
    const { data: fileRow } = await ctx.db
      .from("files")
      .select("id, path")
      .eq("repo_id", ctx.repoId)
      .eq("path", file)
      .maybeSingle();

    if (fileRow?.id) {
      const { data: editsData } = await ctx.db
        .from("edits")
        .select("op, summary, created_at, agent_id, intent_id")
        .eq("file_id", fileRow.id)
        .order("created_at", { ascending: true })
        .limit(50);
      for (const e of editsData ?? []) {
        events.push({
          at: e.created_at,
          kind: "edit",
          author: e.agent_id,
          text: `${e.op} ${file}`,
          detail: e.summary ?? undefined,
        });
      }

      // intents that produced these edits
      const intentIds = Array.from(new Set((editsData ?? []).map((e: any) => e.intent_id)));
      if (intentIds.length > 0) {
        const { data: intentsData } = await ctx.db
          .from("intents")
          .select("id, title, status, agent_id, created_at, shipped_at, pr_url")
          .in("id", intentIds);
        for (const i of intentsData ?? []) {
          events.push({
            at: i.created_at,
            kind: "intent_start",
            author: i.agent_id,
            text: `intent: "${i.title}"`,
          });
          if (i.shipped_at) {
            events.push({
              at: i.shipped_at,
              kind: "intent_ship",
              author: i.agent_id,
              text: `shipped: "${i.title}"`,
              detail: i.pr_url ?? undefined,
            });
          }
        }
      }
    }

    // Decisions ILIKE referencing this file
    const { data: decData } = await ctx.db
      .from("decisions")
      .select("number, title, body, authored_by, created_at")
      .eq("repo_id", ctx.repoId)
      .or(`title.ilike.%${file}%,body.ilike.%${file}%`)
      .order("created_at", { ascending: true })
      .limit(20);
    for (const d of decData ?? []) {
      events.push({
        at: d.created_at,
        kind: "decision",
        author: d.authored_by,
        text: `decision ${String(d.number).padStart(4, "0")}: ${d.title}`,
      });
    }
  } else {
    // feature-scoped: ILIKE across intent titles + decision titles + handoff notes
    const q = args.target!;
    const [intents, decisions, handoffs] = await Promise.all([
      ctx.db
        .from("intents")
        .select("id, title, status, agent_id, created_at, shipped_at, pr_url, body")
        .eq("repo_id", ctx.repoId)
        .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
        .limit(30),
      ctx.db
        .from("decisions")
        .select("number, title, body, authored_by, created_at")
        .eq("repo_id", ctx.repoId)
        .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
        .limit(20),
      ctx.db
        .from("handoffs")
        .select("from_agent, to_agent, note, status, created_at, branch_name")
        .eq("repo_id", ctx.repoId)
        .ilike("note", `%${q}%`)
        .limit(20),
    ]);

    for (const i of intents.data ?? []) {
      events.push({
        at: i.created_at,
        kind: "intent_start",
        author: i.agent_id,
        text: `intent: "${i.title}"`,
      });
      if (i.shipped_at) {
        events.push({
          at: i.shipped_at,
          kind: "intent_ship",
          author: i.agent_id,
          text: `shipped: "${i.title}"`,
          detail: i.pr_url ?? undefined,
        });
      }
    }
    for (const d of decisions.data ?? []) {
      events.push({
        at: d.created_at,
        kind: "decision",
        author: d.authored_by,
        text: `decision ${String(d.number).padStart(4, "0")}: ${d.title}`,
      });
    }
    for (const h of handoffs.data ?? []) {
      events.push({
        at: h.created_at,
        kind: "handoff",
        author: h.from_agent,
        text: `handoff → ${h.to_agent ?? "anyone"}: ${h.note.slice(0, 80)}`,
        detail: h.branch_name ? `[${h.branch_name}] status=${h.status}` : undefined,
      });
    }
  }

  events.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  // Render
  const lines: string[] = [];
  lines.push(`audit-trail: ${args.target} (${events.length} events)`);
  lines.push("");
  if (events.length === 0) {
    lines.push("(no events recorded for this target)");
  } else {
    let lastDate = "";
    for (const e of events) {
      const date = e.at.slice(0, 10);
      const time = e.at.slice(11, 16);
      if (date !== lastDate) {
        lines.push(`── ${date}`);
        lastDate = date;
      }
      const symbol =
        e.kind === "intent_start"
          ? "▶ "
          : e.kind === "intent_ship"
          ? "✓ "
          : e.kind === "decision"
          ? "◆ "
          : e.kind === "handoff"
          ? "↪ "
          : e.kind === "edit"
          ? "  "
          : "  ";
      lines.push(`  ${time}  ${symbol}${e.author}  ${e.text}`);
      if (e.detail) lines.push(`           ${e.detail}`);
    }
  }

  emit(lines.join("\n"), { ok: true, target: args.target, events });
}
