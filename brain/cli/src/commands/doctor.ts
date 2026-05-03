import { tryLoadConfig } from "../config.ts";
import { brain } from "../client.ts";
import { emit, emitError } from "../output.ts";

export async function doctor() {
  const cfg = tryLoadConfig();
  if (!cfg) {
    emitError("config missing — run ./setup from the fstack install root");
  }
  const db = brain(cfg);

  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // 1. agent row exists
  try {
    const { data, error } = await db
      .from("agents")
      .select("id, display_name")
      .eq("id", cfg.agent_id)
      .maybeSingle();
    if (error) throw error;
    checks.push({
      name: `agent '${cfg.agent_id}' registered`,
      ok: Boolean(data),
      detail: data ? `as '${data.display_name}'` : "missing — apply schema.sql",
    });
  } catch (err: any) {
    checks.push({
      name: "supabase connection",
      ok: false,
      detail: String(err?.message ?? err),
    });
  }

  // 2. schema reachable
  try {
    const { error } = await db.from("repos").select("id").limit(1);
    checks.push({
      name: "fstack schema reachable",
      ok: !error,
      detail: error?.message,
    });
  } catch (err: any) {
    checks.push({
      name: "fstack schema reachable",
      ok: false,
      detail: String(err?.message ?? err),
    });
  }

  // 3. realtime publication present
  try {
    const { error } = await db
      .from("presence")
      .select("agent_id")
      .limit(1);
    checks.push({
      name: "presence table queryable",
      ok: !error,
      detail: error?.message,
    });
  } catch (err: any) {
    checks.push({
      name: "presence table queryable",
      ok: false,
      detail: String(err?.message ?? err),
    });
  }

  const allOk = checks.every((c) => c.ok);
  const lines = [
    `fstack-brain doctor — agent='${cfg.agent_id}' brain='${cfg.brain_url}'`,
    "",
    ...checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
    "",
    allOk ? "All checks passed." : "Some checks failed. See detail above.",
  ];
  emit(lines.join("\n"), { ok: allOk, checks });
  process.exit(allOk ? 0 : 1);
}
