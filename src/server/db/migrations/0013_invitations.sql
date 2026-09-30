-- Invitations inside a sandbox (spec §8.6, §9). The invitation letter goes to the
-- outbox, and its link is accepted from a session in the same sandbox (his decision,
-- 29 September): the page reads the invitation through find_invitation, which
-- members of every role may call, and accept_invitation creates the member with the
-- invited role and replaces the caller's session with theirs, as "Switch user" does.
-- Row-level security would let a manager or a viewer neither read the invitation
-- nor create a user, so both are definer functions scoped to the current workspace.

create function fa.find_invitation(p_token_hash text)
  returns table (state text, email text, role fa.role, inviter_name text)
  language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when i.accepted_at is not null then 'accepted'
              when i.revoked_at is not null then 'revoked'
              when i.expires_at <= now() then 'expired'
              else 'pending' end,
         i.email, i.role, u.name
    from fa.invitations i
    left join fa.users u on u.workspace_id = i.workspace_id and u.id = i.invited_by
   where i.workspace_id = fa.app_workspace() and i.token_hash = p_token_hash
$$;

-- The expected outcomes come back as a row: 'accepted' with the new member and the
-- sandbox's expiry, 'invalid' (unknown, revoked, used or expired) and 'taken' (the
-- email already belongs to a member). The row lock makes a second acceptance of the
-- same invitation, even a concurrent one, see it as used.
create function fa.accept_invitation(p_token_hash text, p_name text, p_current_session_hash text, p_session_hash text,
    p_user_agent text, p_ip_hash text)
  returns table (outcome text, user_id uuid, sandbox_expires_at timestamptz)
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_ws uuid := fa.app_workspace();
  v_actor uuid := fa.app_user();
  v_expires timestamptz;
  v_invitation fa.invitations%rowtype;
  v_user uuid;
begin
  select w.expires_at into v_expires from fa.workspaces w where w.id = v_ws and w.kind = 'sandbox';
  if v_expires is null then
    raise exception 'not inside a sandbox' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_invitation from fa.invitations i where i.workspace_id = v_ws and i.token_hash = p_token_hash for update;
  if not found or v_invitation.accepted_at is not null or v_invitation.revoked_at is not null or v_invitation.expires_at <= now() then
    return query select 'invalid'::text, null::uuid, null::timestamptz;
    return;
  end if;
  if exists (select 1 from fa.users u where u.workspace_id = v_ws and pg_catalog.lower(u.email) = pg_catalog.lower(v_invitation.email)) then
    return query select 'taken'::text, null::uuid, null::timestamptz;
    return;
  end if;
  delete from fa.sessions s where s.workspace_id = v_ws and s.id = p_current_session_hash and s.user_id = v_actor;
  if not found then
    raise exception 'the current session was not found' using errcode = 'invalid_parameter_value';
  end if;
  -- The new member keeps the visitor's language.
  insert into fa.users (workspace_id, email, name, role, locale)
    select v_ws, v_invitation.email, p_name, v_invitation.role, coalesce((select u.locale from fa.users u where u.workspace_id = v_ws and u.id = v_actor), 'en')
    returning id into v_user;
  update fa.invitations i set accepted_at = now() where i.workspace_id = v_ws and i.id = v_invitation.id;
  insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at, user_agent_summary, ip_hash)
    values (v_ws, p_session_hash, v_user, v_expires, true, now(), p_user_agent, p_ip_hash);
  insert into fa.activity_log (workspace_id, actor_user_id, action, entity_type, entity_id, details, ip_hash)
    values (v_ws, v_user, 'team.invitation_accepted', 'user', v_user::text,
            pg_catalog.jsonb_build_object('name', p_name, 'role', v_invitation.role), p_ip_hash);
  insert into fa.notifications (workspace_id, user_id, kind, payload)
    values (v_ws, v_invitation.invited_by, 'team.invitation_accepted', pg_catalog.jsonb_build_object('name', p_name, 'role', v_invitation.role));
  return query select 'accepted'::text, v_user, v_expires;
end
$$;

grant execute on function fa.find_invitation(text), fa.accept_invitation(text, text, text, text, text, text) to app;
