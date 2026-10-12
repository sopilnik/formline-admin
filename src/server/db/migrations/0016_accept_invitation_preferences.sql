-- Accepting an invitation writes the new member's preferences in the same statement as the
-- member. A second transaction used to write them after the first had committed the member
-- and replaced the visitor's session, so a failure there signed the visitor out with the
-- invitation already spent. The function now takes the language, the theme and the shortcut
-- switch, and everything it does commits together or not at all.

drop function fa.accept_invitation(text, text, text, text, text, text);

create function fa.accept_invitation(p_token_hash text, p_name text, p_current_session_hash text, p_session_hash text,
    p_user_agent text, p_ip_hash text, p_locale text, p_theme text, p_shortcuts_enabled boolean)
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
  -- The new member takes the visitor's language, theme and shortcut switch, as "Switch user" hands them over.
  insert into fa.users (workspace_id, email, name, role, locale, theme, shortcuts_enabled)
    values (v_ws, v_invitation.email, p_name, v_invitation.role, p_locale, p_theme, p_shortcuts_enabled)
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

grant execute on function fa.accept_invitation(text, text, text, text, text, text, text, text, boolean) to app;
