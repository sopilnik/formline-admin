-- Housekeeping (spec §6.4, §6.5). delete_expired_sandboxes runs after every demo
-- entry, off the critical path, and daily; purge_housekeeping runs daily. Both
-- report what they removed.
create function fa.delete_expired_sandboxes() returns integer
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_deleted integer := 0;
  v_id uuid;
begin
  for v_id in
    select w.id from fa.workspaces w
     where w.kind = 'sandbox' and (w.expires_at <= now() or w.last_active_at <= now() - interval '2 hours')
  loop
    perform fa.queue_workspace_media(v_id);
    delete from fa.workspaces w where w.id = v_id;
    v_deleted := v_deleted + 1;
  end loop;
  return v_deleted;
end
$$;

create function fa.purge_housekeeping()
  returns table (purged_rate_limits integer, purged_challenges integer, purged_sessions integer, purged_failed_sign_ins integer)
  language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  v_rate integer;
  v_challenges integer;
  v_sessions integer;
  v_log integer;
begin
  delete from fa.rate_limits r where r.window_start < now() - interval '1 day';
  get diagnostics v_rate = row_count;
  delete from fa.used_challenges c where c.used_at < now() - interval '1 day';
  get diagnostics v_challenges = row_count;
  delete from fa.sessions s where s.expires_at <= now();
  get diagnostics v_sessions = row_count;
  delete from fa.activity_log a where a.action = 'auth.sign_in_failed' and a.at < now() - interval '90 days';
  get diagnostics v_log = row_count;
  return query select v_rate, v_challenges, v_sessions, v_log;
end
$$;

grant execute on function fa.delete_expired_sandboxes(), fa.purge_housekeeping() to app;
