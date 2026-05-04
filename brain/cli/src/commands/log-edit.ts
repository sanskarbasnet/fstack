import { buildCtx } from "../context.ts";
import { emit } from "../output.ts";
import { relative } from "node:path";
import { enqueue, getCachedIntent } from "../queue.ts";

/**
 * Hook handler for PostToolUse on Edit/Write/MultiEdit.
 * Local-first: queues edit_log + heartbeat ops, returns immediately.
 *
 * Args: --file <abs-path> [--op edit|write|create|delete|rename] [--summary "..."]
 */
export async function logEditCmd(args: {
  file?: string;
  op?: "edit" | "write" | "create" | "delete" | "rename";
  summary?: string;
}) {
  if (!args.file) {
    emit("log-edit: --file required, skipping", { ok: false, reason: "no-file" });
    return;
  }

  let ctx;
  try {
    ctx = buildCtx();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not inside a git repo")) {
      emit("log-edit: skipped (not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }

  const intent = getCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id);
  if (!intent) {
    emit("log-edit: no active intent, skipping", {
      ok: false,
      reason: "no-active-intent",
    });
    return;
  }

  const relPath = relative(ctx.cwd, args.file);
  const path = relPath.startsWith("..") ? args.file : relPath;
  const now = new Date().toISOString();

  enqueue({
    op: "edit_log",
    payload: {
      intent_id: intent.id,
      agent_id: ctx.cfg.agent_id,
      repo_canonical: ctx.repoCanonical,
      file_path: path,
      op: args.op ?? "edit",
      summary: args.summary,
      created_at: now,
    },
  });

  // Refresh heartbeat with this file as active
  enqueue({
    op: "heartbeat",
    payload: {
      agent_id: ctx.cfg.agent_id,
      repo_canonical: ctx.repoCanonical,
      branch_name: ctx.branchName,
      intent_id: intent.id,
      status: "coding",
      active_files: [path],
      last_heartbeat: now,
      machine: ctx.cfg.machine,
    },
  });

  emit(`log-edit ok — ${args.op ?? "edit"} ${path} [queued]`, {
    ok: true,
    file: path,
    intent_id: intent.id,
  });
}
