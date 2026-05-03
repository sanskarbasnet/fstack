import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FstackConfig } from "./config.ts";

let _client: SupabaseClient | null = null;

export function brain(cfg: FstackConfig): SupabaseClient {
  if (_client) return _client;
  _client = createClient(cfg.brain_url, cfg.brain_anon_key, {
    db: { schema: "fstack" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// -----------------------------------------------------------------------------
// Repo / branch / file / feature upserts (call into SQL helper functions)
// -----------------------------------------------------------------------------

export async function ensureRepo(
  db: SupabaseClient,
  canonical: string,
  defaultBranch: string = "main"
): Promise<string> {
  const existing = await db
    .from("repos")
    .select("id")
    .eq("canonical", canonical)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;

  const inserted = await db
    .from("repos")
    .insert({ canonical, default_branch: defaultBranch })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id as string;
}

export async function ensureBranch(
  db: SupabaseClient,
  repoId: string,
  name: string
): Promise<string> {
  const { data, error } = await db.rpc("upsert_branch", {
    p_repo_id: repoId,
    p_name: name,
  });
  if (error) throw error;
  return data as string;
}

export async function ensureFile(
  db: SupabaseClient,
  repoId: string,
  path: string
): Promise<string> {
  const { data, error } = await db.rpc("upsert_file", {
    p_repo_id: repoId,
    p_path: path,
  });
  if (error) throw error;
  return data as string;
}

export async function ensureFeature(
  db: SupabaseClient,
  repoId: string,
  name: string
): Promise<string> {
  const { data, error } = await db.rpc("upsert_feature", {
    p_repo_id: repoId,
    p_name: name,
  });
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------------
// Intent operations
// -----------------------------------------------------------------------------

export type Intent = {
  id: string;
  agent_id: string;
  repo_id: string;
  branch_id: string;
  title: string;
  body: string | null;
  promises: string | null;
  not_touching: string | null;
  status: "active" | "shipped" | "abandoned" | "paused";
  inferred: boolean;
  created_at: string;
  updated_at: string;
  shipped_at: string | null;
  pr_url: string | null;
};

export async function activeIntentForBranch(
  db: SupabaseClient,
  agentId: string,
  branchId: string
): Promise<Intent | null> {
  const { data, error } = await db
    .from("intents")
    .select("*")
    .eq("agent_id", agentId)
    .eq("branch_id", branchId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Intent) ?? null;
}

export async function writeIntent(
  db: SupabaseClient,
  args: {
    agentId: string;
    repoId: string;
    branchId: string;
    title: string;
    body?: string;
    promises?: string;
    notTouching?: string;
    inferred?: boolean;
  }
): Promise<Intent> {
  const { data, error } = await db
    .from("intents")
    .insert({
      agent_id: args.agentId,
      repo_id: args.repoId,
      branch_id: args.branchId,
      title: args.title,
      body: args.body ?? null,
      promises: args.promises ?? null,
      not_touching: args.notTouching ?? null,
      inferred: args.inferred ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Intent;
}

export async function listOtherActiveIntents(
  db: SupabaseClient,
  args: { agentId: string; repoId: string }
): Promise<Array<Intent & { agent_name?: string; branch_name?: string }>> {
  const { data, error } = await db
    .from("active_intents")
    .select("*")
    .eq("repo_id", args.repoId)
    .neq("agent_id", args.agentId);
  if (error) throw error;
  return (data ?? []) as any[];
}

// -----------------------------------------------------------------------------
// Edits log
// -----------------------------------------------------------------------------

export async function logEdit(
  db: SupabaseClient,
  args: {
    intentId: string;
    agentId: string;
    fileId: string;
    op: "edit" | "write" | "create" | "delete" | "rename";
    summary?: string;
  }
): Promise<void> {
  const { error } = await db.from("edits").insert({
    intent_id: args.intentId,
    agent_id: args.agentId,
    file_id: args.fileId,
    op: args.op,
    summary: args.summary ?? null,
  });
  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Presence (live)
// -----------------------------------------------------------------------------

export async function heartbeat(
  db: SupabaseClient,
  args: {
    agentId: string;
    repoId: string;
    branchName?: string;
    intentId?: string;
    status: string;
    activeFiles?: string[];
    machine?: string;
  }
): Promise<void> {
  const { error } = await db.from("presence").upsert(
    {
      agent_id: args.agentId,
      repo_id: args.repoId,
      branch_name: args.branchName ?? null,
      intent_id: args.intentId ?? null,
      status: args.status,
      active_files: args.activeFiles ?? [],
      last_heartbeat: new Date().toISOString(),
      machine: args.machine ?? null,
    },
    { onConflict: "agent_id,repo_id" }
  );
  if (error) throw error;
}

export async function liveOtherPresence(
  db: SupabaseClient,
  args: { agentId: string; repoId: string }
) {
  const { data, error } = await db
    .from("live_presence")
    .select("*")
    .neq("agent_id", args.agentId);
  if (error) throw error;
  return data ?? [];
}

// -----------------------------------------------------------------------------
// Decisions
// -----------------------------------------------------------------------------

export async function nextDecisionNumber(
  db: SupabaseClient,
  repoId: string
): Promise<number> {
  const { data, error } = await db.rpc("next_decision_number", {
    p_repo_id: repoId,
  });
  if (error) throw error;
  return data as number;
}

export async function writeDecision(
  db: SupabaseClient,
  args: {
    repoId: string;
    number: number;
    title: string;
    body: string;
    authoredBy: string;
  }
) {
  const { data, error } = await db
    .from("decisions")
    .insert({
      repo_id: args.repoId,
      number: args.number,
      title: args.title,
      body: args.body,
      authored_by: args.authoredBy,
      timeline: [
        {
          at: new Date().toISOString(),
          who: args.authoredBy,
          event: "authored",
        },
      ],
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function searchDecisions(
  db: SupabaseClient,
  args: { repoId: string; query: string; limit?: number }
) {
  const { data, error } = await db
    .from("decisions")
    .select("id, number, title, body, status, created_at, authored_by")
    .eq("repo_id", args.repoId)
    .or(`title.ilike.%${args.query}%,body.ilike.%${args.query}%`)
    .order("created_at", { ascending: false })
    .limit(args.limit ?? 10);
  if (error) throw error;
  return data ?? [];
}

// -----------------------------------------------------------------------------
// Handoffs
// -----------------------------------------------------------------------------

export async function writeHandoff(
  db: SupabaseClient,
  args: {
    repoId: string;
    intentId?: string;
    fromAgent: string;
    toAgent?: string;
    branchName?: string;
    note: string;
    blocker?: string;
    nextStep?: string;
    uncommittedFiles?: string[];
    autoGenerated?: boolean;
  }
) {
  const { data, error } = await db
    .from("handoffs")
    .insert({
      repo_id: args.repoId,
      intent_id: args.intentId ?? null,
      from_agent: args.fromAgent,
      to_agent: args.toAgent ?? null,
      branch_name: args.branchName ?? null,
      note: args.note,
      blocker: args.blocker ?? null,
      next_step: args.nextStep ?? null,
      uncommitted_files: args.uncommittedFiles ?? [],
      auto_generated: args.autoGenerated ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function openHandoffs(
  db: SupabaseClient,
  args: { repoId: string; toAgent?: string }
) {
  let q = db
    .from("handoffs")
    .select("*")
    .eq("repo_id", args.repoId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (args.toAgent) {
    // accept handoffs addressed to this agent OR to nobody (null)
    q = q.or(`to_agent.eq.${args.toAgent},to_agent.is.null`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
