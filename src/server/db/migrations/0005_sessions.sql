-- The owner workspace exists from here on; its only user, the owner, is created
-- by /setup (create_owner), and its catalog arrives with the template build.
insert into fa.workspaces (kind) select 'owner' where not exists (select 1 from fa.workspaces w where w.kind = 'owner');

create function fa.owner_workspace_id() returns uuid
  language sql stable security definer set search_path = pg_catalog, pg_temp as
  $$ select w.id from fa.workspaces w where w.kind = 'owner' $$;

-- Resolves a session token hash to the request identity across workspaces: the
-- caller has no workspace yet, so row-level security would hide the row. An
-- expired, idle or orphaned session resolves to nothing. The role is read live,
-- so a role change applies on the next request. Activity is written at most once
-- a minute (spec §5.1, §6.2).
create function fa.auth_session(p_token_hash text)
  returns table (workspace_id uuid, workspace_kind fa.workspace_kind, user_id uuid, role fa.role,
    second_factor_verified boolean, reauth_at timestamptz, expires_at timestamptz)
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
#variable_conflict use_column
declare
  s record;
begin
  select se.workspace_id as ws, se.id as sid, se.user_id as uid, se.last_seen_at as seen, se.expires_at as sexp,
         se.second_factor_verified as verified, se.reauth_at as reauth,
         w.kind as kind, w.expires_at as wexp, w.last_active_at as wactive,
         u.role as urole, u.deactivated_at as deactivated
    into s
    from fa.sessions se
    join fa.workspaces w on w.id = se.workspace_id
    join fa.users u on u.workspace_id = se.workspace_id and u.id = se.user_id
   where se.id = p_token_hash;
  if not found
     or s.sexp <= now()
     or s.deactivated is not null
     or s.kind = 'template'
     or (s.kind = 'owner' and s.seen <= now() - interval '12 hours')
     or (s.kind = 'sandbox' and (s.wexp <= now() or s.wactive <= now() - interval '2 hours')) then
    return;
  end if;
  if s.seen <= now() - interval '1 minute' then
    update fa.sessions se set last_seen_at = now() where se.workspace_id = s.ws and se.id = s.sid;
    update fa.workspaces w set last_active_at = now() where w.id = s.ws;
  end if;
  return query select s.ws, s.kind, s.uid, s.urole, s.verified, s.reauth, s.sexp;
end
$$;

grant execute on function fa.owner_workspace_id(), fa.auth_session(text) to app;
