-- Ending and resetting the current sandbox (spec §6.2, §6.4). Both read the
-- caller's workspace from the request identity, so a session can only act on its
-- own sandbox; deleting the workspace row cascades through every table. Uploaded
-- images cannot be removed from storage here, so their paths are queued first.
create function fa.end_sandbox() returns integer
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_ws uuid := fa.app_workspace();
  v_queued integer;
begin
  if v_ws is null or not exists (select 1 from fa.workspaces w where w.id = v_ws and w.kind = 'sandbox') then
    raise exception 'not inside a sandbox' using errcode = 'invalid_parameter_value';
  end if;
  v_queued := fa.queue_workspace_media(v_ws);
  delete from fa.workspaces w where w.id = v_ws;
  return v_queued;
end
$$;

-- A reset is a new sandbox for the same visitor and counts against the
-- per-address limit like an entry. The old sandbox leaves the live count while
-- the new one is created and comes back untouched when the entry is refused.
create function fa.reset_sandbox(p_ip_hash text, p_session_hash text, p_user_agent text, p_locale text)
  returns table (outcome text, sandbox_id uuid, demo_user_id uuid, sandbox_expires_at timestamptz, retry_after_seconds integer)
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_ws uuid := fa.app_workspace();
  v_old_expiry timestamptz;
  r record;
begin
  select w.expires_at into v_old_expiry from fa.workspaces w where w.id = v_ws and w.kind = 'sandbox';
  if v_old_expiry is null then
    raise exception 'not inside a sandbox' using errcode = 'invalid_parameter_value';
  end if;
  update fa.workspaces w set expires_at = now() where w.id = v_ws;
  select * into r from fa.create_sandbox(p_ip_hash, p_session_hash, p_user_agent, p_locale);
  if r.outcome = 'created' then
    perform fa.queue_workspace_media(v_ws);
    delete from fa.workspaces w where w.id = v_ws;
  else
    update fa.workspaces w set expires_at = v_old_expiry where w.id = v_ws;
  end if;
  return query select r.outcome, r.sandbox_id, r.demo_user_id, r.sandbox_expires_at, r.retry_after_seconds;
end
$$;

grant execute on function fa.end_sandbox(), fa.reset_sandbox(text, text, text, text) to app;
