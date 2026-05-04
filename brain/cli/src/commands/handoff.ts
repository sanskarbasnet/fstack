import { buildCtx, buildCtxFull } from "../context.ts";
import {
  openHandoffs,
  ensureRepo,
  ensureBranch,
  ensureFile,
} from "../client.ts";
import { uncommittedFiles, defaultBranch } from "../git.ts";
import { emit } from "../output.ts";
import { enqueue, drainQueue, getCachedIntent } from "../queue.ts";

/**
 * handoff write — local-first. Queues brain insert.
 */
export async function handoffWrite(args: {
  note?: string;
  blocker?: string;
  nextStep?: string;
  toAgent?: string;
}) {
  if (!args.note) {
    emit("handoff write: --note required", { ok: false });
    process.exit(2);
  }
  const ctx = buildCtx();
  const intent = getCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const handoff = {
    id,
    repo_canonical: ctx.repoCanonical,
    intent_id: intent?.id,
    from_agent: ctx.cfg.agent_id,
    to_agent: args.toAgent,
    branch_name: ctx.branchName,
    note: args.note,
    blocker: args.blocker,
    next_step: args.nextStep,
    uncommitted_files: uncommittedFiles(),
    auto_generated: false,
    created_at: now,
  };

  enqueue({ op: "handoff_write", payload: handoff });
  emit(`handoff ok — '${args.note.slice(0, 60)}...' [queued for brain]`, {
    ok: true,
    handoff,
    queued: true,
  });
}

/**
 * handoff auto — SessionEnd hook. Quietly writes a stub if active intent
 * + uncommitted files. Local-first.
 */
export async function handoffAuto() {
  let ctx;
  try {
    ctx = buildCtx();
  } catch {
    emit("(auto-handoff skipped — no repo/config)", { ok: true, skipped: true });
    return;
  }
  const intent = getCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id);
  if (!intent) {
    emit("auto-handoff: no active intent, skipping", { ok: false });
    return;
  }
  const uncommitted = uncommittedFiles();
  if (uncommitted.length === 0) {
    emit("auto-handoff: no uncommitted files, skipping", { ok: false });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  enqueue({
    op: "handoff_write",
    payload: {
      id,
      repo_canonical: ctx.repoCanonical,
      intent_id: intent.id,
      from_agent: ctx.cfg.agent_id,
      branch_name: ctx.branchName,
      note: `(auto) Session ended with ${uncommitted.length} uncommitted file(s) on '${intent.title}'`,
      uncommitted_files: uncommitted,
      auto_generated: true,
      created_at: now,
    },
  });

  // Best-effort drain on session end so the handoff lands before the user closes
  try {
    await drainQueue(
      ctx.db,
      async (c) => ensureRepo(ctx.db, c, defaultBranch()),
      async (r, b) => ensureBranch(ctx.db, r, b),
      async (r, p) => ensureFile(ctx.db, r, p)
    );
  } catch {
    // Best-effort; queue persists regardless
  }

  emit(`auto-handoff ok — ${uncommitted.length} files in flight [queued]`, {
    ok: true,
    intent_id: intent.id,
    uncommitted,
  });
}

/**
 * handoff list — drain queue first so just-written handoffs surface.
 */
export async function handoffsList() {
  const ctx = await buildCtxFull();
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );
  const handoffs = await openHandoffs(ctx.db, {
    repoId: ctx.repoId,
    toAgent: ctx.cfg.agent_id,
  });
  if (handoffs.length === 0) {
    emit("(no open handoffs for you)", { ok: true, handoffs: [] });
    return;
  }
  const lines = handoffs.map((h: any) => {
    const blocker = h.blocker ? ` [blocker: ${h.blocker}]` : "";
    return `• from ${h.from_agent} on ${h.branch_name ?? "?"}: ${h.note}${blocker}`;
  });
  emit(lines.join("\n"), { ok: true, handoffs });
}
