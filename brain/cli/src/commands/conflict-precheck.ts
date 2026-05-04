import { buildCtxFull } from "../context.ts";
import {
  activeIntentForBranch,
  listOtherActiveIntents,
} from "../client.ts";
import { changedFilesSinceBase, defaultBranch } from "../git.ts";
import { emit } from "../output.ts";

/**
 * conflict-precheck — called via PreToolUse on `git push`. Compares files in
 * the current diff against other agents' open intents to surface regression
 * risk before the push.
 *
 * Emits a non-blocking warning to stdout; never aborts the push (the agent
 * decides what to do with the warning).
 */
export async function conflictPrecheck() {
  let ctx;
  try {
    ctx = await buildCtxFull();
  } catch {
    // Not in a repo / no config — silent pass-through.
    emit("(precheck skipped — no fstack context)", { ok: true, skipped: true });
    return;
  }

  const myIntent = await activeIntentForBranch(
    ctx.db,
    ctx.cfg.agent_id,
    ctx.branchId
  );
  const others = await listOtherActiveIntents(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
  });

  const base = defaultBranch();
  const changed = changedFilesSinceBase(base);

  if (changed.length === 0) {
    emit("(precheck: no diff vs base)", { ok: true, no_diff: true });
    return;
  }

  // Pull edits from other agents' active intents. Cheaper than per-file probe:
  // join intents → edits → files in one query.
  const otherIntentIds = others.map((i: any) => i.id);
  let warnings: Array<{ file: string; intent: any }> = [];
  if (otherIntentIds.length > 0) {
    const { data, error } = await ctx.db
      .from("edits")
      .select("file_id, intent_id, files!inner(path), intents!inner(id, title, agent_id)")
      .in("intent_id", otherIntentIds);
    if (!error && data) {
      const otherTouchedPaths = new Map<string, any>();
      for (const row of data as any[]) {
        const path = row.files?.path;
        if (path) {
          otherTouchedPaths.set(path, row.intents);
        }
      }
      for (const f of changed) {
        const intent = otherTouchedPaths.get(f);
        if (intent) {
          warnings.push({ file: f, intent });
        }
      }
    }
  }

  if (warnings.length === 0) {
    emit("(precheck: no overlap with other agents)", { ok: true });
    return;
  }

  const lines: string[] = [];
  lines.push(
    `⚠ fstack precheck: ${warnings.length} file(s) overlap with other agents' open intents:`
  );
  for (const w of warnings) {
    lines.push(`  • ${w.file} ← ${w.intent.agent_id}: "${w.intent.title}"`);
  }
  lines.push("");
  lines.push(
    `Your intent: ${myIntent ? `"${myIntent.title}"` : "(none — write one with /intent)"}`
  );
  lines.push("Push proceeds. /resolve will have full context if a conflict surfaces.");
  emit(lines.join("\n"), { ok: true, warnings });
}
