import { buildCtx } from "../context.ts";
import { emit } from "../output.ts";
import { enqueue, getCachedIntent } from "../queue.ts";

/**
 * heartbeat — local-first. Queues a presence upsert.
 *
 * Background loop / hooks call this every ~30s (or on file edits via log-edit).
 */
export async function heartbeat(args: { status?: string; activeFiles?: string[] }) {
  let ctx;
  try {
    ctx = buildCtx();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not inside a git repo")) {
      emit("heartbeat: skipped (not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }

  const intent = getCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id);
  const now = new Date().toISOString();

  enqueue({
    op: "heartbeat",
    payload: {
      agent_id: ctx.cfg.agent_id,
      repo_canonical: ctx.repoCanonical,
      branch_name: ctx.branchName,
      intent_id: intent?.id,
      status: args.status ?? "coding",
      active_files: args.activeFiles ?? [],
      last_heartbeat: now,
      machine: ctx.cfg.machine,
    },
  });

  emit(
    `heartbeat ok — ${ctx.cfg.agent_id}@${ctx.branchName} status=${args.status ?? "coding"} [queued]`,
    { ok: true, agent: ctx.cfg.agent_id, branch: ctx.branchName }
  );
}
