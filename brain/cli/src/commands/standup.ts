import { buildCtx } from "../context.ts";
import { emit } from "../output.ts";

/**
 * standup --window day|week — weekly/daily activity digest.
 */
export async function standupCmd(args: { window?: "day" | "week" }) {
  const ctx = await buildCtx();
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - (args.window === "week" ? 7 : 1));
  const sinceISO = since.toISOString();

  const [shipped, active, decisions, handoffs] = await Promise.all([
    ctx.db
      .from("intents")
      .select("agent_id, title, pr_url, shipped_at")
      .eq("repo_id", ctx.repoId)
      .eq("status", "shipped")
      .gte("shipped_at", sinceISO)
      .order("shipped_at", { ascending: false }),
    ctx.db
      .from("intents")
      .select("agent_id, title, updated_at")
      .eq("repo_id", ctx.repoId)
      .in("status", ["active", "paused"])
      .order("updated_at", { ascending: false }),
    ctx.db
      .from("decisions")
      .select("number, title, authored_by, created_at")
      .eq("repo_id", ctx.repoId)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false }),
    ctx.db
      .from("handoffs")
      .select("from_agent, to_agent, note, status, created_at")
      .eq("repo_id", ctx.repoId)
      .gte("created_at", sinceISO),
  ]);

  const lines: string[] = [];
  const window = args.window === "week" ? "week" : "day";
  lines.push(`fstack standup — last ${window}`);
  lines.push("");

  const sh = shipped.data ?? [];
  lines.push(`Shipped (${sh.length}):`);
  for (const r of sh) {
    lines.push(`  • ${r.agent_id} — ${r.title}${r.pr_url ? ` (${r.pr_url})` : ""}`);
  }

  const ac = active.data ?? [];
  lines.push("");
  lines.push(`In flight (${ac.length}):`);
  for (const r of ac) {
    lines.push(`  • ${r.agent_id} — ${r.title}`);
  }

  const dc = decisions.data ?? [];
  if (dc.length > 0) {
    lines.push("");
    lines.push(`Decisions (${dc.length}):`);
    for (const r of dc) {
      const num = String(r.number).padStart(4, "0");
      lines.push(`  • ${num} ${r.title} (by ${r.authored_by})`);
    }
  }

  const hc = handoffs.data ?? [];
  if (hc.length > 0) {
    lines.push("");
    lines.push(`Handoffs (${hc.length}):`);
    for (const h of hc) {
      lines.push(
        `  • ${h.from_agent} → ${h.to_agent ?? "anyone"}: ${h.note.slice(0, 60)}`
      );
    }
  }

  emit(lines.join("\n"), {
    ok: true,
    window,
    shipped: sh,
    active: ac,
    decisions: dc,
    handoffs: hc,
  });
}
