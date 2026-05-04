import { buildCtx, buildCtxFull } from "../context.ts";
import { activeIntentForBranch, ensureRepo, ensureBranch, ensureFile } from "../client.ts";
import { emit } from "../output.ts";
import { defaultBranch } from "../git.ts";
import {
  enqueue,
  drainQueue,
  getCachedIntent,
  setCachedIntent,
} from "../queue.ts";
import { runCoordinate, formatCoordinateWarning } from "./coordinate.ts";

/**
 * intent get — local-first.
 *
 * Reads from the local intent cache (set by every intent write/infer). If the
 * cache has no entry for this branch, fall back to Supabase.
 */
export async function intentGet() {
  // Fast path: pure local-cache lookup, no Supabase.
  const ctxLite = buildCtx();
  let intent = getCachedIntent(
    ctxLite.repoCanonical,
    ctxLite.branchName,
    ctxLite.cfg.agent_id
  );

  if (!intent) {
    // Cache miss → upgrade to full context, drain, fall back to Supabase
    const ctx = await buildCtxFull();
    await drainQueue(
      ctx.db,
      async (c) => ensureRepo(ctx.db, c, defaultBranch()),
      async (r, b) => ensureBranch(ctx.db, r, b),
      async (r, p) => ensureFile(ctx.db, r, p)
    );
    intent = await activeIntentForBranch(ctx.db, ctx.cfg.agent_id, ctx.branchId);
    if (intent) {
      setCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id, intent);
    }
  }

  if (!intent) {
    emit("(no active intent)", { ok: true, intent: null });
    return;
  }
  emit(
    [
      `Active intent on ${ctxLite.branchName}:`,
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
 * intent write — local-first.
 *
 * Writes to local cache + queues brain insert. If a prior active intent
 * exists for this branch, queue a status='paused' update.
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
  const ctx = buildCtx();

  // Pause any prior active intent (queued)
  const existing = getCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id);
  if (existing?.id) {
    enqueue({ op: "intent_pause", payload: { intent_id: existing.id } });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const intent = {
    id,
    agent_id: ctx.cfg.agent_id,
    repo_id: ctx.repoId,
    branch_id: ctx.branchId,
    title: args.title,
    body: args.body ?? null,
    promises: args.promises ?? null,
    not_touching: args.notTouching ?? null,
    inferred: args.inferred ?? false,
    status: "active",
    created_at: now,
    updated_at: now,
  };

  // Write local cache (authoritative for this writer)
  setCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id, intent);

  // Queue brain insert
  enqueue({
    op: "intent_write",
    payload: {
      ...intent,
      repo_canonical: ctx.repoCanonical,
      branch_name: ctx.branchName,
    },
  });

  emit(`intent ok — '${intent.title}' on ${ctx.branchName} [queued for brain]`, {
    ok: true,
    intent,
    queued: true,
  });
}

/**
 * intent infer — local-first stub from a user prompt. Only writes if no
 * active intent for this branch in the cache.
 */
export async function intentInfer(args: { prompt?: string }) {
  if (!args.prompt) {
    emit("intent infer: --prompt required, skipping", {
      ok: false,
      reason: "no-prompt",
    });
    return;
  }
  let ctx;
  try {
    ctx = buildCtx();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("not inside a git repo")) {
      emit("intent infer: skipped (not in a git repo)", {
        ok: true,
        skipped: "no-repo",
      });
      return;
    }
    throw err;
  }

  const existing = getCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id);
  if (existing) {
    emit(`intent infer: existing active intent — '${existing.title}'`, {
      ok: true,
      kept_existing: existing.id,
    });
    return;
  }

  const firstLine = args.prompt.split("\n")[0]?.trim() ?? args.prompt.trim();
  const title = firstLine.slice(0, 120);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Drafting a NEW intent — also run coordinate to surface any collisions.
  // Skips quietly if not in a repo with brain context (e.g., very new repo
  // where buildCtx returned empty repoId/branchId — runCoordinate would
  // fail; we upgrade to full context just for this.) Best-effort.
  let coordinateWarning = "";
  let coordinateData: any = null;
  try {
    const fullCtx = await buildCtxFull();
    const r = await runCoordinate(fullCtx, args.prompt.trim());
    if (r.has_signal) {
      coordinateWarning = "\n\n[fstack coordinate]\n" + formatCoordinateWarning(r);
      coordinateData = r;
    }
  } catch {
    // Best-effort — never block intent_infer on coordinate failures
  }

  const body = (args.prompt.trim().slice(0, 1500) + coordinateWarning).slice(0, 3000);

  const intent = {
    id,
    agent_id: ctx.cfg.agent_id,
    repo_id: ctx.repoId,
    branch_id: ctx.branchId,
    title,
    body,
    promises: null,
    not_touching: null,
    inferred: true,
    status: "active",
    created_at: now,
    updated_at: now,
  };
  setCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id, intent);
  enqueue({
    op: "intent_write",
    payload: {
      ...intent,
      repo_canonical: ctx.repoCanonical,
      branch_name: ctx.branchName,
    },
  });
  // Emit. If coordinate found something, prepend the warning to the human
  // line so the agent sees it in stdout.
  const headline = coordinateWarning
    ? `intent inferred — '${intent.title}' (stub; refine with /intent)\n⚠ COORDINATE WARNING — overlap detected, see intent body`
    : `intent inferred — '${intent.title}' (stub; refine with /intent)`;

  emit(headline, {
    ok: true,
    inferred: intent,
    coordinate: coordinateData,
  });
}

/**
 * intent ship — mark intent as shipped. Update local cache + queue brain update.
 */
export async function intentShip(args: { prUrl?: string }) {
  const ctx = buildCtx();
  const existing = getCachedIntent(
    ctx.repoCanonical,
    ctx.branchName,
    ctx.cfg.agent_id
  );
  if (!existing) {
    emit("intent ship: no active intent", { ok: false });
    return;
  }
  const shippedAt = new Date().toISOString();
  // Drop from local active cache (it's no longer active)
  setCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id, null);
  enqueue({
    op: "intent_ship",
    payload: {
      intent_id: existing.id,
      shipped_at: shippedAt,
      pr_url: args.prUrl ?? null,
    },
  });
  emit(`intent shipped — '${existing.title}' [queued for brain]`, {
    ok: true,
    intent_id: existing.id,
  });
}
