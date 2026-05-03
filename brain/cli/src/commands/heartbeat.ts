import { buildCtx } from "../context.ts";
import { activeIntentForBranch, heartbeat as hbWrite } from "../client.ts";
import { emit } from "../output.ts";

/**
 * Background heartbeat. Called every ~30s by the session-runner OR
 * synchronously by hooks. Writes one row to `presence` (upsert).
 */
export async function heartbeat(args: { status?: string; activeFiles?: string[] }) {
  const ctx = await buildCtx();
  const intent = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);

  await hbWrite(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
    branchName: ctx.branchName,
    intentId: intent?.id,
    status: args.status ?? "coding",
    activeFiles: args.activeFiles ?? [],
    machine: ctx.cfg.machine,
  });

  emit(
    `heartbeat ok — ${ctx.cfg.agent_id}@${ctx.branchName} status=${args.status ?? "coding"}`,
    { ok: true, agent: ctx.cfg.agent_id, branch: ctx.branchName }
  );
}
