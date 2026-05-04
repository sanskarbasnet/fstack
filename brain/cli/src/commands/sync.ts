import { buildCtxFull } from "../context.ts";
import {
  liveOtherPresence,
  listOtherActiveIntents,
  openHandoffs,
  ensureRepo,
  ensureBranch,
  ensureFile,
} from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";

/**
 * sync — pull latest brain state, format the SessionStart digest.
 *
 * Always succeeds (best-effort). Network failures degrade silently. If the
 * caller isn't in a git repo at all, we skip silently — SessionStart often
 * fires before the user has cd'd into one.
 */
export async function syncCmd() {
  let ctx;
  try {
    ctx = await buildCtxFull();
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    // Not in a git repo — silent skip; this is a normal SessionStart case.
    if (msg.includes("not inside a git repo")) {
      emit("(sync skipped — not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }

  // Drain any local writes queued since last read so they show up below.
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );

  // Stale-presence sweep so we don't show ghosts.
  await ctx.db.rpc("expire_stale_presence", {
    p_threshold: "00:05:00",
  });

  const [othersPresence, otherIntents, myHandoffs, recentDecisions] =
    await Promise.all([
      liveOtherPresence(ctx.db, {
        agentId: ctx.cfg.agent_id,
        repoId: ctx.repoId,
      }),
      listOtherActiveIntents(ctx.db, {
        agentId: ctx.cfg.agent_id,
        repoId: ctx.repoId,
      }),
      openHandoffs(ctx.db, {
        repoId: ctx.repoId,
        toAgent: ctx.cfg.agent_id,
      }),
      ctx.db
        .from("decisions")
        .select("number, title, authored_by, created_at")
        .eq("repo_id", ctx.repoId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const decisions = recentDecisions.data ?? [];

  const lines: string[] = [];
  lines.push(`fstack /sync — ${ctx.cfg.agent_id}@${ctx.branchName}`);
  lines.push("");

  if (othersPresence.length === 0) {
    lines.push("Other agents: none currently live.");
  } else {
    lines.push("Other agents (live):");
    for (const p of othersPresence as any[]) {
      const intent = p.intent_title ? ` — "${p.intent_title}"` : "";
      const branch = p.branch_name ? ` [${p.branch_name}]` : "";
      lines.push(
        `  • ${p.agent_id}${branch}${intent}  status=${p.status} files=${(p.active_files ?? []).length}`
      );
    }
  }

  if (otherIntents.length > 0) {
    lines.push("");
    lines.push("Other agents' open intents:");
    for (const i of otherIntents) {
      const branch = (i as any).branch_name ?? "?";
      lines.push(`  • ${i.agent_id} [${branch}] — ${i.title}`);
    }
  }

  if (myHandoffs.length > 0) {
    lines.push("");
    lines.push("Open handoffs for you:");
    for (const h of myHandoffs as any[]) {
      lines.push(
        `  • from ${h.from_agent}: ${h.note}${h.blocker ? ` (blocker: ${h.blocker})` : ""}`
      );
    }
  }

  if (decisions.length > 0) {
    lines.push("");
    lines.push("Recent decisions:");
    for (const d of decisions) {
      const num = String(d.number).padStart(4, "0");
      lines.push(`  • ${num} ${d.title} (by ${d.authored_by})`);
    }
  }

  lines.push("");
  emit(lines.join("\n"), {
    ok: true,
    others_presence: othersPresence,
    other_intents: otherIntents,
    handoffs: myHandoffs,
    recent_decisions: decisions,
  });
}
