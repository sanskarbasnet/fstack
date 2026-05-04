import { buildCtxFull } from "../context.ts";
import {
  liveOtherPresence,
  ensureRepo,
  ensureBranch,
  ensureFile,
} from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue } from "../queue.ts";
import { emit } from "../output.ts";

/**
 * presence — show live presence of other agents in this repo.
 */
export async function presenceShow() {
  const ctx = await buildCtxFull();
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );
  const others = await liveOtherPresence(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
  });

  if (others.length === 0) {
    emit("(no other agents currently live)", { ok: true, presence: [] });
    return;
  }
  const lines = (others as any[]).map((p) => {
    const ageSec = Math.round(
      (Date.now() - new Date(p.last_heartbeat).getTime()) / 1000
    );
    const intent = p.intent_title ? ` — "${p.intent_title}"` : "";
    const branch = p.branch_name ? ` [${p.branch_name}]` : "";
    const files =
      p.active_files?.length ? ` files=[${(p.active_files as string[]).join(", ")}]` : "";
    return `• ${p.agent_id}${branch}${intent}  status=${p.status}${files}  (${ageSec}s ago)`;
  });
  emit(lines.join("\n"), { ok: true, presence: others });
}
