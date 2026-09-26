-- Owner recovery when every factor is lost (spec §5.8). The CLI, run with the
-- migrator connection as schema_owner, stores the hash of a one-time code; /recover
-- redeems it together with a new password, a new authenticator and new recovery
-- codes. Whatever was lost may be in someone else's hands, so every passkey and
-- session of the owner goes.
create function fa.issue_owner_recovery(p_code_hash text) returns timestamptz
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_expires timestamptz := now() + interval '30 minutes';
begin
  if not exists (
    select 1 from fa.users u join fa.workspaces w on w.id = u.workspace_id where w.kind = 'owner' and u.role = 'owner'
  ) then
    raise exception 'there is no owner to recover' using errcode = 'no_data_found';
  end if;
  delete from fa.owner_recovery_codes c where c.used_at is null;
  insert into fa.owner_recovery_codes (code_hash, expires_at) values (p_code_hash, v_expires);
  return v_expires;
end
$$;

create function fa.redeem_owner_recovery(p_code_hash text, p_user_id uuid, p_password_hash text,
    p_totp_secret_enc text, p_totp_step bigint, p_recovery_hashes text[], p_session_hash text,
    p_user_agent text, p_ip_hash text)
  returns timestamptz
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_workspace uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  update fa.owner_recovery_codes c set used_at = now()
   where c.code_hash = p_code_hash and c.used_at is null and c.expires_at > now();
  if not found then
    return null;
  end if;
  select u.workspace_id into v_workspace
    from fa.users u join fa.workspaces w on w.id = u.workspace_id
   where w.kind = 'owner' and u.role = 'owner' and u.id = p_user_id;
  if v_workspace is null then
    raise exception 'the user is not the owner' using errcode = 'invalid_parameter_value';
  end if;
  if p_password_hash not like '$argon2id$%' then
    raise exception 'the password hash is not Argon2id' using errcode = 'invalid_parameter_value';
  end if;
  if pg_catalog.cardinality(p_recovery_hashes) <> 10 then
    raise exception 'ten recovery codes are required' using errcode = 'invalid_parameter_value';
  end if;
  update fa.users u set password_hash = p_password_hash, totp_secret_enc = p_totp_secret_enc, totp_last_step = p_totp_step
   where u.workspace_id = v_workspace and u.id = p_user_id;
  delete from fa.recovery_codes r where r.workspace_id = v_workspace and r.user_id = p_user_id;
  insert into fa.recovery_codes (workspace_id, user_id, code_hash)
    select v_workspace, p_user_id, h from pg_catalog.unnest(p_recovery_hashes) as h;
  delete from fa.passkeys p where p.workspace_id = v_workspace and p.user_id = p_user_id;
  delete from fa.sessions s where s.workspace_id = v_workspace and s.user_id = p_user_id;
  insert into fa.sessions (workspace_id, id, user_id, expires_at, second_factor_verified, reauth_at, user_agent_summary, ip_hash)
    values (v_workspace, p_session_hash, p_user_id, v_expires, true, now(), p_user_agent, p_ip_hash);
  return v_expires;
end
$$;

grant execute on function fa.redeem_owner_recovery(text, uuid, text, text, bigint, text[], text, text, text) to app;
