import { buildCtx } from "../context.ts";
import {
  activeIntentForBranch,
  writeIntent as writeIntentRow,
} from "../client.ts";
import { emit } from "../output.ts";

/**
 * intent get — return current active intent for this branch.
 */
export async function intentGet() {
  const ctx = await buildCtx();
  const intent = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);
  if (!intent) {
    emit("(no active intent)", { ok: true, intent: null });
    return;
  }
  emit(
    [
      `Active intent on ${ctx.branchName}:`,
      `  ${intent.title}`,
      intent.body ? `  ${intent.body}` : "",
      intent.promises ? `  PROMISES: ${intent.promises}` : "",
      intent.not_touching ? `  NOT TOUCHING: ${intent.not_touching}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { ok: true, intent }
  );
}

/**
 * intent write — explicit write (called by /intent slash command).
 * If an active intent exists for this branch, it is paused.
 */
export async function intentWrite(args: {
  title?: string;
  body?: string;
  promises?: string;
  notTouching?: string;
  inferred?: boolean;
}) {
  if (!args.title) {
    emit("intent write: --title required", { ok: false });
    process.exit(2);
  }
  const ctx = await buildCtx();

  // Pause any prior active intent on this branch.
  const existing = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);
  if (existing) {
    await ctx.db
      .from("intents")
      .update({ status: "paused" })
      .eq("id", existing.id);
  }

  const intent = await writeIntentRow(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
    branchId: ctx.branchId,
    title: args.title,
    body: args.body,
    promises: args.promises,
    notTouching: args.notTouching,
    inferred: args.inferred ?? false,
  });
  emit(`intent ok — '${intent.title}' on ${ctx.branchName}`, {
    ok: true,
    intent,
  });
}

/**
 * intent infer — used by UserPromptSubmit hook.
 * Only writes a stub if no active intent exists. Title comes from --prompt.
 */
export async function intentInfer(args: { prompt?: string }) {
  if (!args.prompt) {
    emit("intent infer: --prompt required, skipping", {
      ok: false,
      reason: "no-prompt",
    });
    return;
  }
  const ctx = await buildCtx();
  const existing = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);
  if (existing) {
    emit(`intent infer: existing active intent — '${existing.title}'`, {
      ok: true,
      kept_existing: existing.id,
    });
    return;
  }
  // First substantive prompt of the session — draft an intent stub.
  // Title = first line of prompt, max 120 chars. Agent confirms via /intent later.
  const firstLine = args.prompt.split("\n")[0]?.trim() ?? args.prompt.trim();
  const title = firstLine.slice(0, 120);
  const intent = await writeIntentRow(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
    branchId: ctx.branchId,
    title,
    body: args.prompt.trim().slice(0, 1500),
    inferred: true,
  });
  emit(`intent inferred — '${intent.title}' (stub; refine with /intent)`, {
    ok: true,
    inferred: intent,
  });
}

/**
 * intent ship — mark intent as shipped (called by /ship after PR creation).
 */
export async function intentShip(args: { prUrl?: string }) {
  const ctx = await buildCtx();
  const existing = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);
  if (!existing) {
    emit("intent ship: no active intent", { ok: false });
    return;
  }
  await ctx.db
    .from("intents")
    .update({
      status: "shipped",
      shipped_at: new Date().toISOString(),
      pr_url: args.prUrl ?? null,
    })
    .eq("id", existing.id);
  emit(`intent shipped — '${existing.title}'`, { ok: true, intent_id: existing.id });
}
