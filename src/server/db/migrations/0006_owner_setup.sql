-- Creates the one owner of the owner workspace in one call: password, encrypted
-- TOTP secret, recovery codes and a verified session, so the owner never exists
-- without a second factor. It refuses once an owner exists, and the
-- users_one_owner index settles a race between two calls (spec §5.8).
create function fa.create_owner(p_user_id uuid, p_email text, p_name text, p_password_hash text,
    p_totp_secret_enc text, p_totp_step bigint, p_recovery_hashes text[], p_session_hash text,
    p_user_agent text, p_ip_hash text)
  returns timestamptz
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_workspace uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  select w.id into v_workspace from fa.workspaces w where w.kind = 'owner';
  if v_workspace is null then
    raise exception 'the owner workspace does not exist' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from fa.users u where u.workspace_id = v_workspace and u.role = 'owner') then
    raise exception 'the owner already exists' using errcode = 'unique_violation';
  end if;
  if p_password_hash not like '$argon2id$%' then
    raise exception 'the password hash is not Argon2id' using errcode = 'invalid_parameter_value';
  end if;
  if pg_catalog.cardinality(p_recovery_hashes) <> 10 then
    raise exception 'ten recovery codes are required' using errcode = 'invalid_parameter_value';
  end if;
  insert into fa.users (workspace_id, id, email, name, role, password_hash, totp_secret_enc, totp_last_step)
    values (v_workspace, p_user_id, p_email, p_name, 'owner', p_password_hash, p_totp_secret_enc, p_totp_step);
  insert into fa.recovery_codes (workspace_id, user_id, code_hash)
    select v_workspace, p_user_id, h from pg_catalog.unnest(p_recovery_hashes) as h;
  insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at, user_agent_summary, ip_hash)
    values (v_workspace, p_session_hash, p_user_id, v_expires, true, now(), p_user_agent, p_ip_hash);
  return v_expires;
end
$$;

grant execute on function fa.create_owner(uuid, text, text, text, text, bigint, text[], text, text, text) to app;
