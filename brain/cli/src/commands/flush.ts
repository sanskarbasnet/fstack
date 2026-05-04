import { buildCtxFull } from "../context.ts";
import { ensureRepo, ensureBranch, ensureFile } from "../client.ts";
import { defaultBranch } from "../git.ts";
import { drainQueue, queueDepth } from "../queue.ts";
import { emit } from "../output.ts";

/**
 * flush — manually drain the local write queue to Supabase.
 * Read commands drain automatically; this is for explicit user invocation
 * (e.g. before going offline) and for debugging.
 */
export async function flushCmd() {
  const before = queueDepth();
  if (before === 0) {
    emit("(queue empty, nothing to flush)", { ok: true, flushed: 0 });
    return;
  }
  const ctx = await buildCtxFull();
  const result = await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );
  const lines = [`flushed ${result.flushed} of ${before} entries`];
  if (result.remaining > 0) {
    lines.push(`${result.remaining} entries remain (will retry on next read)`);
  }
  if (result.errors.length > 0) {
    lines.push("errors:");
    for (const e of result.errors.slice(0, 5)) lines.push(`  • ${e}`);
  }
  emit(lines.join("\n"), { ok: true, ...result, depth_before: before });
}

export async function queueStatusCmd() {
  const depth = queueDepth();
  emit(`queue depth: ${depth}`, { ok: true, depth });
}
