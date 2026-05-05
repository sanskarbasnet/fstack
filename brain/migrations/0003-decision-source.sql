-- =============================================================================
-- Migration 0003 — decision source column
--
-- Adds a `source` column to decisions so we can distinguish:
--   - 'manual' — written via /decide or fstack-brain decide write (default)
--   - 'infer'  — auto-detected by the UserPromptSubmit hook
--
-- Auto-inferred decisions are still real decisions; they just got logged
-- without an explicit /decide call. Reviewable via /decide list --source infer.
--
-- Apply to your Supabase project ONCE per shared brain.
-- Idempotent: re-running is safe.
--
-- How to apply:
--   Supabase dashboard → SQL Editor → paste this entire file → Run.
-- =============================================================================

set search_path to fstack, public;

alter table fstack.decisions
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'infer'));

create index if not exists decisions_source_idx
  on fstack.decisions(repo_id, source);

-- Reload PostgREST schema cache so the new column is exposed
notify pgrst, 'reload schema';
