import { buildCtx } from "../context.ts";
import {
  activeIntentForBranch,
  ensureFile,
  logEdit as logEditRow,
  heartbeat,
} from "../client.ts";
import { emit } from "../output.ts";
import { relative } from "node:path";

/**
 * Hook handler for PostToolUse on Edit/Write/MultiEdit.
 * Appends a row to `edits` and refreshes heartbeat.
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
    ctx = await buildCtx();
  } catch (err: any) {
    // Edit/Write outside a git repo — skip silently.
    if (String(err?.message ?? "").includes("not inside a git repo")) {
      emit("log-edit: skipped (not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }
  const intent = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);
  if (!intent) {
    // No active intent yet (e.g. session just opened). Skip silently — we'll
    // catch up once intent-infer runs on first prompt.
    emit("log-edit: no active intent, skipping", {
      ok: false,
      reason: "no-active-intent",
    });
    return;
  }

  const relPath = relative(ctx.cwd, args.file);
  const path = relPath.startsWith("..") ? args.file : relPath;
  const fileId = await ensureFile(ctx.db, ctx.repoId, path);

  await logEditRow(ctx.db, {
    intentId: intent.id,
    agentId: ctx.cfg.agent_id,
    fileId,
    op: args.op ?? "edit",
    summary: args.summary,
  });

  // Refresh heartbeat with this file as active
  await heartbeat(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
    branchName: ctx.branchName,
    intentId: intent.id,
    status: "coding",
    activeFiles: [path],
    machine: ctx.cfg.machine,
  });

  emit(
    `log-edit ok — ${args.op ?? "edit"} ${path} (intent: ${intent.title})`,
    { ok: true, file: path, intent_id: intent.id }
  );
}
