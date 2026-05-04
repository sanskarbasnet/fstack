import { buildCtx, buildCtxFull } from "../context.ts";
import {
  ensureRepo,
  ensureBranch,
  ensureFile,
  writeIntent,
} from "../client.ts";
import { defaultBranch } from "../git.ts";
import {
  enqueue,
  drainQueue,
  setCachedIntent,
} from "../queue.ts";
import { emit, emitError } from "../output.ts";

/**
 * wishlist add — local-first capture of a future idea.
 *
 * Wishlist rows are SEPARATE from intents:
 *   - intents = NOW, on a branch, with promises and not-touching
 *   - wishlist = LATER, no branch, no commitment
 *
 * Promote a wishlist row to an intent when ready (wishlist promote --id ...).
 */
export async function wishlistAdd(args: {
  title?: string;
  body?: string;
  tags?: string;
}) {
  if (!args.title) emitError("wishlist add: --title required", 2);

  const ctx = buildCtx();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = args.tags
    ? args.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  enqueue({
    op: "intent_write" as any, // reuse the queue plumbing — wishlist add op below
    payload: {
      __wishlist__: true,
      id,
      agent_id: ctx.cfg.agent_id,
      repo_canonical: ctx.repoCanonical,
      title: args.title,
      body: args.body ?? null,
      tags,
      created_at: now,
    },
  });

  // Direct insert path — wishlist isn't latency-critical (rare write) and we
  // want it to land in the brain quickly so /ideas list shows it.
  // Fall back to queueing if Supabase is slow.
  try {
    const fullCtx = await buildCtxFull();
    const { error } = await fullCtx.db.from("wishlist").insert({
      id,
      agent_id: fullCtx.cfg.agent_id,
      repo_id: fullCtx.repoId,
      title: args.title,
      body: args.body ?? null,
      tags,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;
    emit(`💡 idea captured: '${args.title}' (id=${id.slice(0, 8)})`, {
      ok: true,
      id,
      title: args.title,
      tags,
    });
  } catch (err: any) {
    emit(`💡 idea captured (queued — brain unreachable): '${args.title}'`, {
      ok: true,
      queued: true,
      id,
      title: args.title,
      error: String(err?.message ?? err).slice(0, 200),
    });
  }
}

export async function wishlistList(args: { status?: string; limit?: number }) {
  const ctx = await buildCtxFull();
  await drainQueue(
    ctx.db,
    async (c) => ensureRepo(ctx.db, c, defaultBranch()),
    async (r, b) => ensureBranch(ctx.db, r, b),
    async (r, p) => ensureFile(ctx.db, r, p)
  );

  const status = args.status ?? "open";
  const { data, error } = await ctx.db
    .from("wishlist")
    .select("id, agent_id, title, body, tags, status, created_at")
    .eq("repo_id", ctx.repoId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 50);
  if (error) throw error;

  if (!data || data.length === 0) {
    emit(`(no ${status} ideas)`, { ok: true, ideas: [] });
    return;
  }

  const lines: string[] = [];
  lines.push(`${status} ideas (${data.length}):`);
  for (const i of data) {
    const tags = i.tags && i.tags.length ? ` [${i.tags.join(",")}]` : "";
    lines.push(`  • ${i.id.slice(0, 8)} ${i.agent_id}${tags} — ${i.title}`);
    if (i.body) lines.push(`      ${i.body.slice(0, 200)}`);
  }
  emit(lines.join("\n"), { ok: true, ideas: data, status });
}

export async function wishlistPromote(args: { id?: string }) {
  if (!args.id) emitError("wishlist promote: --id required", 2);

  const ctx = await buildCtxFull();

  // 1. Find the wishlist row
  const { data: row, error: fetchErr } = await ctx.db
    .from("wishlist")
    .select("*")
    .eq("repo_id", ctx.repoId)
    .ilike("id", `${args.id}%`) // accept short prefix
    .eq("status", "open")
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!row) {
    emit(`(no open idea with id starting '${args.id}')`, {
      ok: false,
      reason: "not-found",
    });
    return;
  }

  // 2. Create an intent on current branch from this wishlist row
  const intent = await writeIntent(ctx.db, {
    agentId: ctx.cfg.agent_id,
    repoId: ctx.repoId,
    branchId: ctx.branchId,
    title: row.title,
    body: (row.body ?? "") + `\n\n[promoted from idea ${row.id.slice(0, 8)}]`,
    inferred: false,
  });

  // 3. Mark wishlist row as promoted
  const { error: updErr } = await ctx.db
    .from("wishlist")
    .update({
      status: "promoted",
      promoted_to_intent: intent.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updErr) throw updErr;

  // 4. Update local intent cache so /intent get returns this immediately
  setCachedIntent(ctx.repoCanonical, ctx.branchName, ctx.cfg.agent_id, intent);

  emit(
    `✓ promoted idea '${row.title}' → intent on branch '${ctx.branchName}'`,
    { ok: true, intent, wishlist_id: row.id }
  );
}

export async function wishlistReject(args: { id?: string; reason?: string }) {
  if (!args.id) emitError("wishlist reject: --id required", 2);
  const ctx = await buildCtxFull();
  const { data: row } = await ctx.db
    .from("wishlist")
    .select("id, title")
    .eq("repo_id", ctx.repoId)
    .ilike("id", `${args.id}%`)
    .eq("status", "open")
    .maybeSingle();
  if (!row) {
    emit(`(no open idea with id starting '${args.id}')`, { ok: false });
    return;
  }
  const newBody = args.reason
    ? `[rejected: ${args.reason}]`
    : `[rejected]`;
  await ctx.db
    .from("wishlist")
    .update({
      status: "rejected",
      body: newBody,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  emit(`✗ rejected idea '${row.title}'`, { ok: true, id: row.id });
}

export async function wishlistSnooze(args: { id?: string }) {
  if (!args.id) emitError("wishlist snooze: --id required", 2);
  const ctx = await buildCtxFull();
  const { data: row } = await ctx.db
    .from("wishlist")
    .select("id, title")
    .eq("repo_id", ctx.repoId)
    .ilike("id", `${args.id}%`)
    .eq("status", "open")
    .maybeSingle();
  if (!row) {
    emit(`(no open idea with id starting '${args.id}')`, { ok: false });
    return;
  }
  await ctx.db
    .from("wishlist")
    .update({ status: "snoozed" })
    .eq("id", row.id);
  emit(`zzz snoozed '${row.title}'`, { ok: true, id: row.id });
}
