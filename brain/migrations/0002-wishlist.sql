-- =============================================================================
-- Migration 0002 — wishlist table
--
-- Apply to your Supabase project ONCE per shared brain.
-- Idempotent: re-running is safe.
--
-- How to apply:
--   Supabase dashboard → SQL Editor → paste this entire file → Run.
-- =============================================================================

set search_path to fstack, public;

-- wishlist: future ideas. Separate from intents.
create table if not exists fstack.wishlist (
  id            uuid primary key default gen_random_uuid(),
  agent_id      text not null references fstack.agents(id) on delete restrict,
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  title         text not null,
  body          text,
  tags          text[] default '{}',
  status        text not null default 'open'
                check (status in ('open','snoozed','promoted','rejected')),
  promoted_to_intent uuid references fstack.intents(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index if not exists wishlist_repo_status_idx on fstack.wishlist(repo_id, status);
create index if not exists wishlist_agent_idx on fstack.wishlist(agent_id);

drop trigger if exists wishlist_touch on fstack.wishlist;
create trigger wishlist_touch before update on fstack.wishlist
  for each row execute function fstack.touch_updated_at();

-- Grants for PostgREST anon role
grant select, insert, update, delete on fstack.wishlist to anon, authenticated;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
