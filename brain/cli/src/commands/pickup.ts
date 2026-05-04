import { buildCtxFull } from "../context.ts";
import {
  ensureRepo,
  ensureBranch,
  ensureFile,
  openHandoffs,
} from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";

/**
 * handoff pickup — claim a handoff + hydrate context.
 *
 * Marks the handoff status='picked_up' and resolved_by=<me>, then returns
 * a hydration payload: parent intent, recent edits on referenced files,
 * related decisions. The skill (/pickup) renders this for the user.
 *
 * No intent ownership transfer — the original intent stays attributed to the
 * author. The picker gets context; if they want to continue under their own
 * intent, they /intent write afterwards.
 */
export async function handoffPickup(args: { id?: string }) {
  const ctx = await buildCtxFull();
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );

  // 1. Resolve which handoff
  let handoff;
  if (args.id) {
    const { data, error } = await ctx.db
      .from("handoffs")
      .select("*")
      .eq("id", args.id)
      .eq("status", "open")
      .maybeSingle();
    if (error) throw error;
    handoff = data;
    if (!handoff) {
      emit(`(no open handoff with id=${args.id})`, { ok: false, reason: "not-found" });
      return;
    }
  } else {
    // Pick the most recent open handoff addressed to me OR to anyone
    const candidates = await openHandoffs(ctx.db, {
      repoId: ctx.repoId,
      toAgent: ctx.cfg.agent_id,
    });
    if (candidates.length === 0) {
      emit("(no open handoffs to pick up)", { ok: true, handoff: null });
      return;
    }
    handoff = candidates[0];
  }

  // 2. Atomically mark picked_up; reflect the post-update state in the returned object
  const resolvedAt = new Date().toISOString();
  const { error: updateErr } = await ctx.db
    .from("handoffs")
    .update({
      status: "picked_up",
      resolved_at: resolvedAt,
      resolved_by: ctx.cfg.agent_id,
    })
    .eq("id", handoff.id);
  if (updateErr) throw updateErr;
  handoff.status = "picked_up";
  handoff.resolved_at = resolvedAt;
  handoff.resolved_by = ctx.cfg.agent_id;

  // 3. Hydrate context
  // 3a. Parent intent
  let intent: any = null;
  if (handoff.intent_id) {
    const { data } = await ctx.db
      .from("intents")
      .select("*")
      .eq("id", handoff.intent_id)
      .maybeSingle();
    intent = data;
  }

  // 3b. Recent edits on the files mentioned in the handoff
  const files = handoff.uncommitted_files ?? [];
  let recent_edits: any[] = [];
  if (files.length > 0) {
    const { data: filesRows } = await ctx.db
      .from("files")
      .select("id, path")
      .eq("repo_id", ctx.repoId)
      .in("path", files);
    const fileIds = (filesRows ?? []).map((r: any) => r.id);
    if (fileIds.length > 0) {
      const { data: editsRows } = await ctx.db
        .from("edits")
        .select("op, summary, created_at, agent_id, file_id")
        .in("file_id", fileIds)
        .order("created_at", { ascending: false })
        .limit(20);
      const fileById = new Map((filesRows ?? []).map((r: any) => [r.id, r.path]));
      recent_edits = (editsRows ?? []).map((e: any) => ({
        ...e,
        file: fileById.get(e.file_id),
      }));
    }
  }

  // 3c. Related decisions — heuristic: any decision whose body mentions any
  // of the file paths in the handoff. (junction tables would be cleaner but
  // we don't tag decisions to files yet.)
  let related_decisions: any[] = [];
  if (files.length > 0) {
    const orClauses = files.map((f: string) => `body.ilike.%${f}%`).join(",");
    const { data } = await ctx.db
      .from("decisions")
      .select("number, title, body, authored_by, created_at")
      .eq("repo_id", ctx.repoId)
      .or(orClauses)
      .order("created_at", { ascending: false })
      .limit(10);
    related_decisions = data ?? [];
  }

  // 4. Render
  const lines: string[] = [];
  lines.push(`Picked up handoff from ${handoff.from_agent}:`);
  lines.push(`  "${handoff.note}"`);
  if (handoff.blocker) lines.push(`  blocker: ${handoff.blocker}`);
  if (handoff.next_step) lines.push(`  next step: ${handoff.next_step}`);
  if (handoff.branch_name) lines.push(`  branch:    ${handoff.branch_name}`);
  if (files.length > 0) lines.push(`  files:     ${files.join(", ")}`);
  lines.push("");

  if (intent) {
    lines.push(`Parent intent (still attributed to ${intent.agent_id}):`);
    lines.push(`  ${intent.title}`);
    if (intent.body) lines.push(`  ${intent.body}`);
    if (intent.promises) lines.push(`  PROMISES: ${intent.promises}`);
    if (intent.not_touching) lines.push(`  NOT TOUCHING: ${intent.not_touching}`);
    lines.push("");
  } else {
    lines.push("Parent intent: (none)");
    lines.push("");
  }

  if (recent_edits.length > 0) {
    lines.push(`Recent edits on referenced files (last ${recent_edits.length}):`);
    for (const e of recent_edits.slice(0, 10)) {
      lines.push(
        `  • ${e.created_at.slice(0, 10)} ${e.agent_id} [${e.op}] ${e.file ?? "?"}` +
          (e.summary ? `\n      ${e.summary}` : "")
      );
    }
    lines.push("");
  }

  if (related_decisions.length > 0) {
    lines.push(`Related decisions (${related_decisions.length}):`);
    for (const d of related_decisions) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title} (by ${d.authored_by})`);
    }
    lines.push("");
  }

  if (handoff.branch_name && handoff.branch_name !== ctx.branchName) {
    lines.push(
      `Note: handoff branch '${handoff.branch_name}' differs from your current '${ctx.branchName}'.` +
        ` Switch with: git checkout ${handoff.branch_name}`
    );
  }

  emit(lines.join("\n"), {
    ok: true,
    handoff,
    intent,
    recent_edits,
    related_decisions,
    branch_switch_needed: handoff.branch_name && handoff.branch_name !== ctx.branchName,
  });
}
