-- Request identity, set per transaction by withWorkspace(). A pooled connection
-- that once ran set_config(..., true) returns '' afterwards, hence nullif.
create function fa.app_workspace() returns uuid language sql stable as
  $$ select nullif(pg_catalog.current_setting('app.workspace_id', true), '')::uuid $$;
create function fa.app_user() returns uuid language sql stable as
  $$ select nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid $$;
create function fa.app_role() returns text language sql stable as
  $$ select nullif(pg_catalog.current_setting('app.role', true), '') $$;

create type fa.workspace_kind as enum ('template', 'owner', 'sandbox');
create type fa.role as enum ('owner', 'admin', 'manager', 'viewer');

create table fa.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind fa.workspace_kind not null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  expires_at timestamptz,
  creator_ip_hash text,
  template_version integer,
  constraint workspaces_sandbox_expiry check ((kind = 'sandbox') = (expires_at is not null))
);
create unique index workspaces_one_template on fa.workspaces ((true)) where kind = 'template';
create unique index workspaces_one_owner on fa.workspaces ((true)) where kind = 'owner';
create index workspaces_sandbox_expiry_idx on fa.workspaces (expires_at) where kind = 'sandbox';
create index workspaces_sandbox_activity_idx on fa.workspaces (last_active_at) where kind = 'sandbox';
create index workspaces_creator_idx on fa.workspaces (creator_ip_hash, created_at) where kind = 'sandbox';

create table fa.rate_limits (
  purpose text not null,
  subject text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (purpose, subject, window_start)
);
create index rate_limits_window_idx on fa.rate_limits (window_start);

create table fa.stripe_events (
  event_id text primary key,
  received_at timestamptz not null default now(),
  outcome text not null
);

create table fa.used_challenges (
  challenge_hash text primary key check (challenge_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz not null default now()
);

create table fa.pending_media_deletions (
  storage_path text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now()
);

create table fa.owner_recovery_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz
);
