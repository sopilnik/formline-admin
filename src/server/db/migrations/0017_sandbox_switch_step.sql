-- "Switch user" to a member with an authenticator: the code's step is stored only when it
-- is later than the step already stored, and before anything else changes, so two switches
-- that carry one code cannot both pass. A step already used gives null and changes nothing;
-- the application answers it as a wrong code. Everything else is the function of 0011.
create or replace function fa.sandbox_sign_in_as(p_target_user_id uuid, p_current_session_hash text, p_session_hash text,
    p_totp_step bigint, p_user_agent text, p_ip_hash text)
  returns timestamptz
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_ws uuid := fa.app_workspace();
  v_actor uuid := fa.app_user();
  v_expires timestamptz;
begin
  select w.expires_at into v_expires from fa.workspaces w where w.id = v_ws and w.kind = 'sandbox';
  if v_expires is null then
    raise exception 'not inside a sandbox' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from fa.users u where u.workspace_id = v_ws and u.id = p_target_user_id and u.deactivated_at is null) then
    raise exception 'the target is not an active member of this sandbox' using errcode = 'invalid_parameter_value';
  end if;

  if p_totp_step is not null then
    update fa.users u set totp_last_step = p_totp_step
     where u.workspace_id = v_ws and u.id = p_target_user_id
       and (u.totp_last_step is null or u.totp_last_step < p_totp_step);
    if not found then
      return null;
    end if;
  end if;

  delete from fa.sessions s where s.workspace_id = v_ws and s.id = p_current_session_hash and s.user_id = v_actor;
  if not found then
    raise exception 'the current session was not found' using errcode = 'invalid_parameter_value';
  end if;
  insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at, user_agent_summary, ip_hash)
    values (v_ws, p_session_hash, p_target_user_id, v_expires, true, now(), p_user_agent, p_ip_hash);
  insert into fa.activity_log (workspace_id, actor_user_id, action, entity_type, entity_id, ip_hash)
    values (v_ws, v_actor, 'sandbox.switched_user', 'user', p_target_user_id::text, p_ip_hash);
  return v_expires;
end
$$;
