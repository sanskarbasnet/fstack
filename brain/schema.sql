-- =============================================================================
-- fstack brain — schema
--
-- Graph-shaped relational schema for multi-agent coordination.
-- Apply to a Supabase Postgres project (or any Postgres 15+).
--
-- Run with:
--   psql "$BRAIN_URL" -f brain/schema.sql
-- or paste into Supabase SQL editor.
--
-- After applying, enable Realtime on the `presence` table from the
-- Supabase dashboard (Database → Replication → fstack_realtime publication).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- pgcrypto is enabled by default on Supabase (provides gen_random_uuid()).
-- We don't use uuid-ossp because Supabase installs extensions into the
-- `public` schema by default, and unqualified calls from the `fstack` schema
-- don't resolve. gen_random_uuid() lives in pg_catalog and resolves from
-- anywhere.
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
create schema if not exists fstack;
set search_path to fstack, public;

-- -----------------------------------------------------------------------------
-- updated_at trigger helper
-- -----------------------------------------------------------------------------
create or replace function fstack.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================================
-- FIRST-CLASS ENTITIES
-- =============================================================================

-- agents: humans (sanskar, owen) — one row per person
create table if not exists fstack.agents (
  id            text primary key,                 -- 'sanskar', 'owen'
  display_name  text not null,
  email         text,
  created_at    timestamptz not null default now()
);

-- repos: every row is keyed to a repo (canonical github.com/org/name form)
create table if not exists fstack.repos (
  id            uuid primary key default gen_random_uuid(),
  canonical     text unique not null,             -- 'github.com/foreman/marketplace'
  default_branch text not null default 'main',
  created_at    timestamptz not null default now()
);

-- features: high-level domain tags ('auth', 'billing', 'matching', ...)
-- Created on demand; serves as the join axis for cross-cutting queries.
create table if not exists fstack.features (
  id            uuid primary key default gen_random_uuid(),
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  name          text not null,                    -- 'auth', 'billing'
  description   text,
  created_at    timestamptz not null default now(),
  unique (repo_id, name)
);

create index if not exists features_repo_idx on fstack.features(repo_id);

-- files: first-class so we can attach features and ownership history
create table if not exists fstack.files (
  id            uuid primary key default gen_random_uuid(),
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  path          text not null,                    -- 'src/auth/login.ts'
  last_seen_at  timestamptz not null default now(),
  unique (repo_id, path)
);

create index if not exists files_repo_path_idx on fstack.files(repo_id, path);

-- branches: track current branch states
create table if not exists fstack.branches (
  id            uuid primary key default gen_random_uuid(),
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  name          text not null,                    -- 'sanskar/rate-limit'
  base          text not null default 'main',
  created_at    timestamptz not null default now(),
  unique (repo_id, name)
);

create index if not exists branches_repo_name_idx on fstack.branches(repo_id, name);

-- intents: what an agent is trying to do on a branch
create table if not exists fstack.intents (
  id            uuid primary key default gen_random_uuid(),
  agent_id      text not null references fstack.agents(id) on delete restrict,
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  branch_id     uuid not null references fstack.branches(id) on delete cascade,
  title         text not null,
  body          text,                             -- the intent paragraph
  promises      text,                             -- 'PROMISES: rate limit works.'
  not_touching  text,                             -- 'DOES NOT TOUCH: session logic.'
  status        text not null default 'active'    -- active|shipped|abandoned|paused
                check (status in ('active','shipped','abandoned','paused')),
  inferred      boolean not null default false,   -- agent-drafted vs human-written
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  shipped_at    timestamptz,
  pr_url        text
);

create index if not exists intents_agent_status_idx on fstack.intents(agent_id, status);
create index if not exists intents_branch_idx on fstack.intents(branch_id);
create index if not exists intents_repo_status_idx on fstack.intents(repo_id, status);

drop trigger if exists intents_touch on fstack.intents;
create trigger intents_touch before update on fstack.intents
  for each row execute function fstack.touch_updated_at();

-- edits: append-only change log per intent
create table if not exists fstack.edits (
  id            uuid primary key default gen_random_uuid(),
  intent_id     uuid not null references fstack.intents(id) on delete cascade,
  agent_id      text not null references fstack.agents(id) on delete restrict,
  file_id       uuid not null references fstack.files(id) on delete cascade,
  op            text not null check (op in ('edit','write','create','delete','rename')),
  summary       text,                             -- 'added rateLimitGuard at top of loginHandler'
  created_at    timestamptz not null default now()
);

create index if not exists edits_intent_idx on fstack.edits(intent_id);
create index if not exists edits_file_recent_idx on fstack.edits(file_id, created_at desc);
create index if not exists edits_agent_idx on fstack.edits(agent_id);

-- decisions: ADRs (architectural decision records)
-- Body uses gbrain's compiled-truth + timeline pattern.
create table if not exists fstack.decisions (
  id            uuid primary key default gen_random_uuid(),
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  number        integer not null,                 -- ADR number 0001, 0002 (per repo)
  title         text not null,
  body          text not null,                    -- compiled truth (current understanding)
  timeline      jsonb not null default '[]'::jsonb, -- append-only events array
  status        text not null default 'accepted'
                check (status in ('proposed','accepted','superseded','deprecated')),
  superseded_by uuid references fstack.decisions(id) on delete set null,
  authored_by   text not null references fstack.agents(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (repo_id, number)
);

create index if not exists decisions_repo_idx on fstack.decisions(repo_id);

drop trigger if exists decisions_touch on fstack.decisions;
create trigger decisions_touch before update on fstack.decisions
  for each row execute function fstack.touch_updated_at();

-- handoffs: session handoff notes (auto or rich)
create table if not exists fstack.handoffs (
  id            uuid primary key default gen_random_uuid(),
  repo_id       uuid not null references fstack.repos(id) on delete cascade,
  intent_id     uuid references fstack.intents(id) on delete cascade,
  from_agent    text not null references fstack.agents(id),
  to_agent      text references fstack.agents(id), -- null = whoever picks it up
  branch_name   text,
  note          text not null,
  blocker       text,                             -- 'stuck on traffic shape'
  next_step     text,                             -- 'run scripts/login-traffic-7d.ts'
  uncommitted_files text[] default '{}',
  status        text not null default 'open'
                check (status in ('open','picked_up','resolved','expired')),
  auto_generated boolean not null default false,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   text references fstack.agents(id)
);

create index if not exists handoffs_status_idx on fstack.handoffs(status);
create index if not exists handoffs_repo_status_idx on fstack.handoffs(repo_id, status);

-- presence: LIVE state. One row per agent (per repo). Heartbeat semantics.
create table if not exists fstack.presence (
  agent_id        text not null references fstack.agents(id) on delete cascade,
  repo_id         uuid not null references fstack.repos(id) on delete cascade,
  branch_name     text,
  intent_id       uuid references fstack.intents(id) on delete set null,
  status          text not null default 'idle'
                  check (status in ('planning','coding','reviewing','shipping','browsing','idle','away')),
  active_files    text[] default '{}',
  last_heartbeat  timestamptz not null default now(),
  machine         text,
  primary key (agent_id, repo_id)
);

create index if not exists presence_repo_heartbeat_idx
  on fstack.presence(repo_id, last_heartbeat desc);

-- =============================================================================
-- JUNCTION TABLES (the graph edges)
-- =============================================================================

-- file ↔ feature: which features does this file belong to
create table if not exists fstack.file_features (
  file_id     uuid not null references fstack.files(id) on delete cascade,
  feature_id  uuid not null references fstack.features(id) on delete cascade,
  primary key (file_id, feature_id)
);

create index if not exists file_features_feature_idx on fstack.file_features(feature_id);

-- decision ↔ feature: which features does this decision affect
create table if not exists fstack.decision_features (
  decision_id uuid not null references fstack.decisions(id) on delete cascade,
  feature_id  uuid not null references fstack.features(id) on delete cascade,
  primary key (decision_id, feature_id)
);

create index if not exists decision_features_feature_idx
  on fstack.decision_features(feature_id);

-- decision ↔ file: which files does this decision affect
create table if not exists fstack.decision_files (
  decision_id uuid not null references fstack.decisions(id) on delete cascade,
  file_id     uuid not null references fstack.files(id) on delete cascade,
  primary key (decision_id, file_id)
);

create index if not exists decision_files_file_idx on fstack.decision_files(file_id);

-- intent ↔ feature: which features does this intent target
create table if not exists fstack.intent_features (
  intent_id   uuid not null references fstack.intents(id) on delete cascade,
  feature_id  uuid not null references fstack.features(id) on delete cascade,
  primary key (intent_id, feature_id)
);

create index if not exists intent_features_feature_idx
  on fstack.intent_features(feature_id);

-- intent ↔ decision: which past decisions inform this intent
create table if not exists fstack.intent_decisions (
  intent_id   uuid not null references fstack.intents(id) on delete cascade,
  decision_id uuid not null references fstack.decisions(id) on delete cascade,
  primary key (intent_id, decision_id)
);

create index if not exists intent_decisions_decision_idx
  on fstack.intent_decisions(decision_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- next_decision_number(repo_id) — atomic ADR numbering per repo
create or replace function fstack.next_decision_number(p_repo_id uuid)
returns integer as $$
declare
  next_num integer;
begin
  select coalesce(max(number), 0) + 1
    into next_num
    from fstack.decisions
   where repo_id = p_repo_id;
  return next_num;
end;
$$ language plpgsql;

-- expire_stale_presence() — sweep presence rows older than 5 minutes
-- Call from a cron or just from sync skill
create or replace function fstack.expire_stale_presence(p_threshold interval default '5 minutes')
returns integer as $$
declare
  expired_count integer;
begin
  delete from fstack.presence
   where last_heartbeat < now() - p_threshold;
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$ language plpgsql;

-- upsert_file(repo, path) — get or create file row, return id
create or replace function fstack.upsert_file(p_repo_id uuid, p_path text)
returns uuid as $$
declare
  fid uuid;
begin
  insert into fstack.files (repo_id, path)
       values (p_repo_id, p_path)
  on conflict (repo_id, path) do update set last_seen_at = now()
    returning id into fid;
  return fid;
end;
$$ language plpgsql;

-- upsert_branch(repo, name)
create or replace function fstack.upsert_branch(p_repo_id uuid, p_name text)
returns uuid as $$
declare
  bid uuid;
begin
  insert into fstack.branches (repo_id, name)
       values (p_repo_id, p_name)
  on conflict (repo_id, name) do nothing
    returning id into bid;
  if bid is null then
    select id into bid from fstack.branches
     where repo_id = p_repo_id and name = p_name;
  end if;
  return bid;
end;
$$ language plpgsql;

-- upsert_feature(repo, name)
create or replace function fstack.upsert_feature(p_repo_id uuid, p_name text)
returns uuid as $$
declare
  fid uuid;
begin
  insert into fstack.features (repo_id, name)
       values (p_repo_id, p_name)
  on conflict (repo_id, name) do nothing
    returning id into fid;
  if fid is null then
    select id into fid from fstack.features
     where repo_id = p_repo_id and name = p_name;
  end if;
  return fid;
end;
$$ language plpgsql;

-- =============================================================================
-- QUERY VIEWS (the graph traversals you actually want)
-- =============================================================================

-- live_presence: presence joined to agent + intent + branch
create or replace view fstack.live_presence as
select
  p.agent_id,
  a.display_name as agent_name,
  r.canonical as repo,
  p.branch_name,
  i.title as intent_title,
  i.body as intent_body,
  p.status,
  p.active_files,
  p.last_heartbeat,
  (now() - p.last_heartbeat) as heartbeat_age,
  p.machine
from fstack.presence p
join fstack.agents a on a.id = p.agent_id
join fstack.repos r on r.id = p.repo_id
left join fstack.intents i on i.id = p.intent_id
where p.last_heartbeat > now() - interval '5 minutes';

-- active_intents: not shipped/abandoned, joined to agent + branch
create or replace view fstack.active_intents as
select
  i.id,
  i.agent_id,
  a.display_name as agent_name,
  i.repo_id,
  r.canonical as repo,
  i.branch_id,
  b.name as branch_name,
  i.title,
  i.body,
  i.promises,
  i.not_touching,
  i.status,
  i.created_at,
  i.updated_at
from fstack.intents i
join fstack.agents a on a.id = i.agent_id
join fstack.repos r on r.id = i.repo_id
join fstack.branches b on b.id = i.branch_id
where i.status in ('active','paused');

-- file_intents: which active intents touch a given file
create or replace view fstack.file_intents as
select distinct
  f.repo_id,
  f.path as file_path,
  i.id as intent_id,
  i.agent_id,
  i.title as intent_title,
  i.status as intent_status,
  i.updated_at as intent_updated_at
from fstack.files f
join fstack.edits e on e.file_id = f.id
join fstack.intents i on i.id = e.intent_id
where i.status in ('active','paused');

-- recent_decisions_by_feature: last 50 decisions per feature
create or replace view fstack.decisions_by_feature as
select
  feat.id as feature_id,
  feat.repo_id,
  feat.name as feature_name,
  d.id as decision_id,
  d.number,
  d.title,
  d.status,
  d.created_at
from fstack.features feat
join fstack.decision_features df on df.feature_id = feat.id
join fstack.decisions d on d.id = df.decision_id
order by d.created_at desc;

-- =============================================================================
-- REALTIME PUBLICATION
-- =============================================================================
-- Supabase subscribes to changes on this publication for live updates.
-- Note: you must also enable Realtime on the table in the Supabase dashboard.

drop publication if exists fstack_realtime;
create publication fstack_realtime for table
  fstack.presence,
  fstack.intents,
  fstack.handoffs;

-- =============================================================================
-- POSTGREST GRANTS
-- =============================================================================
-- Supabase's REST API runs as the `anon` role (and `authenticated` for logged-in
-- users). Without these grants, queries fail with "permission denied for schema
-- fstack" even after exposing the schema in Project Settings → API.

grant usage on schema fstack to anon, authenticated;
grant select, insert, update, delete on all tables in schema fstack to anon, authenticated;
grant usage, select on all sequences in schema fstack to anon, authenticated;
grant execute on all functions in schema fstack to anon, authenticated;

-- Future-proofing: tables/seq/funcs added later auto-inherit these grants
alter default privileges in schema fstack
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema fstack
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema fstack
  grant execute on functions to anon, authenticated;

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================
-- v1 model: trusted two-person team, single shared anon key.
-- We do not enable RLS — every row is readable by anyone with the key.
-- agent_id field is for attribution, not access control.
--
-- If you scale beyond two people or take on client work, replace this section
-- with proper RLS policies keyed off auth.uid().

-- =============================================================================
-- SEED
-- =============================================================================
-- Insert agents idempotently. Adjust display names/emails as needed.

insert into fstack.agents (id, display_name, email) values
  ('sanskar', 'Sanskar Basnet', 'sanskarbasnetitahari@gmail.com'),
  ('owen',    'Owen',           null)
on conflict (id) do nothing;
