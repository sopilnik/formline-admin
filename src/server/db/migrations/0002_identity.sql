create table fa.users (
  workspace_id uuid not null references fa.workspaces (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  email text not null check (pg_catalog.length(email) between 3 and 254),
  name text not null check (pg_catalog.length(name) between 1 and 120),
  role fa.role not null,
  password_hash text,
  totp_secret_enc text,
  totp_last_step bigint,
  locale text not null default 'en' check (locale in ('en', 'ru')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  shortcuts_enabled boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create unique index users_email on fa.users (workspace_id, pg_catalog.lower(email));
create unique index users_one_owner on fa.users (workspace_id) where role = 'owner';

-- The same rules as the authorisation matrix, enforced where application code
-- cannot skip them. The definer functions run as schema_owner and are trusted.
create function fa.users_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'schema_owner' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      raise exception 'the owner role cannot be granted' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.workspace_id <> old.workspace_id or new.id <> old.id then
    raise exception 'a user cannot move or change identity' using errcode = '42501';
  end if;
  if old.role = 'owner' and fa.app_user() is distinct from old.id then
    raise exception 'only the owner may change the owner row' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'an email cannot be changed' using errcode = '42501';
  end if;
  if new.role is distinct from old.role then
    if new.role = 'owner' then
      raise exception 'the owner role cannot be granted' using errcode = '42501';
    end if;
    if old.id = fa.app_user() then
      raise exception 'nobody changes their own role' using errcode = '42501';
    end if;
    if fa.app_role() is distinct from 'owner' and fa.app_role() is distinct from 'admin' then
      raise exception 'only owners and admins change roles' using errcode = '42501';
    end if;
  end if;
  if new.deactivated_at is distinct from old.deactivated_at then
    if old.id = fa.app_user() then
      raise exception 'nobody deactivates themselves' using errcode = '42501';
    end if;
    if fa.app_role() is distinct from 'owner' and fa.app_role() is distinct from 'admin' then
      raise exception 'only owners and admins deactivate users' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
create trigger users_guard before insert or update on fa.users for each row execute function fa.users_guard();

create table fa.sessions (
  workspace_id uuid not null,
  id text not null check (id ~ '^[0-9a-f]{64}$'),
  user_id uuid not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  second_factor_verified boolean not null default false,
  reauth_at timestamptz,
  user_agent_summary text check (pg_catalog.length(user_agent_summary) <= 120),
  ip_hash text,
  primary key (workspace_id, id),
  foreign key (workspace_id, user_id) references fa.users (workspace_id, id) on delete cascade
);
create unique index sessions_id on fa.sessions (id);
create index sessions_user_idx on fa.sessions (workspace_id, user_id);
create index sessions_expiry_idx on fa.sessions (expires_at);

create table fa.passkeys (
  workspace_id uuid not null,
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  credential_id text not null check (credential_id ~ '^[A-Za-z0-9_-]+$'),
  public_key text not null,
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}',
  name text not null check (pg_catalog.length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, user_id) references fa.users (workspace_id, id) on delete cascade
);
create unique index passkeys_credential on fa.passkeys (credential_id);

create table fa.recovery_codes (
  workspace_id uuid not null,
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  used_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, user_id, code_hash),
  foreign key (workspace_id, user_id) references fa.users (workspace_id, id) on delete cascade
);

create table fa.invitations (
  workspace_id uuid not null,
  id uuid not null default gen_random_uuid(),
  email text not null check (pg_catalog.length(email) between 3 and 254),
  role fa.role not null check (role <> 'owner'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  token text,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, invited_by) references fa.users (workspace_id, id) on delete cascade
);
create unique index invitations_token on fa.invitations (token_hash);
